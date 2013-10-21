(function($){

var minSentinel = { gissue: { order: 0 }};
var maxSentinel = { gissue: { order: 100 }};


parseOptions();
async.parallel([
	function(callback) {
		loadMilestones(callback);
	},
	function(callback) {
		loadIssues(1, 'open', [], callback);
	},
	function(callback) {
		loadIssues(1, 'closed', [], callback);
	}
], function(err, results) {
	if (err) {
		return console.log(err);
	}
	var issues = {'open': results[1], 'closed': results[2]};
	var total = 0;
	for (var i = 0; i < issues.open.length; i++) {
		parseGissueStatus(issues.open[i]);
		total += issues.open[i].gissue.size;
	}
	for (var j = 0; j < issues.closed.length; j++) {
		parseGissueStatus(issues.closed[j]);
		total += issues.closed[j].gissue.size;
	}
	idealProgress(results[0].created_at, results[0].due_on, total, function(error, days) {
		console.log(days.length);//TODO debug
		render(days);
	});
});
function render(days) {
	$('#svg').empty();
	var rect = $('#graph')[0].getBoundingClientRect();
	var width = rect.width;
	var height = rect.height;
	var margin = {top:30, right:30, bottom:40, left:50};
	width -= margin.right + margin.left;
	height -= margin.top + margin.bottom;

	var x = d3.time.scale().range([0, width]);
	var y = d3.scale.linear().range([height, 0]);
	x.domain([days[0].date, days[days.length-1].date]);
	y.domain([0, days[0].points]).nice();//TODO
	var xAxis = d3.svg.axis().scale(x).orient('bottom').tickSize(-height).tickFormat(function(d) {
		return d.getDate();
	}).ticks(5).tickPadding(10);
	var yAxis = d3.svg.axis().scale(y).orient('left').tickSize(-width).ticks(5).tickPadding(10);
	var svg = d3.select('#svg').append('svg').attr('width', rect.width).attr('height', rect.height).append('g');
	svg.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
	svg.append('g').attr('class', 'x axis day').attr('transform', 'translate(0,' + height + ')').call(xAxis);
	svg.append('g').attr('class', 'y axis').call(yAxis);

	var line = d3.svg.line().interpolate('linear').x(function(d) {
		return x(d.date);
	}).y(function(d) {
		return y(d.points);
	});
	//ideal line
	svg.append('path').attr('class', 'ideal line').attr('d', line.interpolate('basis')(days));
}

function idealProgress(created_at, due_on, total, callback) {
	var days = [];
	var end = new Date(due_on);
	var createdDate = new Date(created_at);
	var y = createdDate.getFullYear();
	var m = createdDate.getMonth();
	var d = createdDate.getDate();

	var calculateDays = function() {
		var day = new Date(y, m, d);
		days.push({date: day});
		if (day < end) {
			d++;
			calculateDays();
		}
	};
	calculateDays();
	var velocity = total / (days.length - 1);
	async.map(days, function(item, cb) {
		item.points = total;
		total -= velocity;
		cb(null, item);
	},function(err, results) {
		callback(null, results);
	});
}

function loadMilestones(callback) {
	if (!options.milestone) {
		return;
	}
	var url = 'https://api.github.com/repos/' + options.repo + '/milestones/' + options.milestone;
	$.ajax({
		url: url,
		error: function (xhr, textStatus, errorThrown) {
			callback(errorThrown);
		},
		success: function (data, textStatus, xhr) {
			//callback(null, JSON.parse(data));
			callback(null, data);
		}
	});


}

//TODO duplicated with the funtions in gissues.js
function parseOptions() {
	parseOption('repo');
	parseOption('milestone');
}
function getQueryParam(name) {
	name = name.replace(/[\[]/, '\\\[').replace(/[\]]/, '\\\]');
	var regexS = '[\\?&]' + name + '=([^&#]*)';
	var regex = new RegExp(regexS);
	var results = regex.exec(window.location.href);
	return results === null ? undefined : decodeURIComponent(results[1].replace(/\+/g, ' '));
}
function parseOption(option) {
	options[option] = getQueryParam(option);
}

function loadIssues(page, state, initial, callback) {
	var url = 'https://api.github.com/repos/' + options.repo + '/issues' +
		'?' + options.access_token +
		'&per_page=100' +
		'&page=' + page +
		'&state=' + state;

	if (options.labels) {
		url += '&labels=' + encodeURIComponent(options.labels);
	}
	if (options.assignee) {
		url += '&assignee=' + encodeURIComponent(options.assignee);
	}
	if (options.mentioned) {
		url += '&mentioned=' + encodeURIComponent(options.mentioned);
	}
	if (options.milestone) {
		url += '&milestone=' + encodeURIComponent(options.milestone);
	}
	if (!initial) {
		initial = [];
	}
	$.ajax({
		url: url,
		error: function (xhr, textStatus, errorThrown) {
			if (xhr && xhr.status === 410) {
				callback('Issue tracking is disabled for this GitHub repository <a href="https://github.com/'
					+ options.repo + '/admin" class="btn small gsmall success">Change it...</a>');
			}
			else {
				callback('An error occurred when retrieving issues from GitHub. Make sure issue tracking is enabled. '
					+ '<a href="https://github.com/'
					+ options.repo + '/admin" class="btn small gsmall success">Check now...</a>');
			}
		},
		success: function (data, textStatus, xhr) {
			var count = data.length;
			filter(data, /^https:\/\/github.com\/.*\/issues\/\d+$/);
			issues = initial.concat(data);
			if (count === 100) {
				loadIssues(page + 1, state, issues, callback);
			}
			else {
				callback(null, issues);
			}
		}
	});
}
function filter(issues, regex) {
	for (var i=issues.length-1; i >= 0; i--) {
		if ( issues[i].html_url && issues[i].html_url.match(regex) ) {
			continue;
		}
		issues.splice(i, 1);
	}
}
function parseGissueStatus(issue) {
	if (issue.body) {
		var index = issue.body.lastIndexOf('@gissues:{');
		if (index !== -1) {
			try {
				var gissue = JSON.parse(issue.body.substring(index + 9, issue.body.indexOf('}', index + 9) + 1));
				issue.gissue = {
					order: gissue.order || maxSentinel.gissue.order,
					status: gissue.status || 'backlog',
					size: gissue.size || 0
				};
				return;
			}
			catch (e) {
			}
		}
	}

	issue.gissue = {
		order: maxSentinel.gissue.order,
		status: 'backlog',
		size: 0
	};
}

}
(jQuery));