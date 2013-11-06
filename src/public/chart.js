/**
	the implementation is referred from https://github.com/radekstepan/github-burndown-chart
*/
(function($){

var minSentinel = { gissue: { order: 0 }};
var maxSentinel = { gissue: { order: 100 }};

$(function(){
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
			$('#chartErrorMessage').html(err);
			$('#gerror').show();
			return console.log(err);
		}
		var milestone = results[0];
		if (options.sprintSize) {
			var beginTime = new Date(milestone.due_on).getTime() - (parseInt(options.sprintSize, 10) - 1)*24*60*60*1000;
			milestone.created_at = new Date(beginTime).toUTCString();
		}
		$('div.box h1').text(milestone.title + '@' + options.repo);
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
		async.parallel([
			function(cb) {
				idealProgress(milestone.created_at, milestone.due_on, total, cb);
			},
			function(cb) {
				actualProgress(issues.closed, milestone.created_at, total, cb);
			}
		], function(error, days) {
			if (error) {
				return console.error(error);
			}
			render({ideal: days[0], actual: days[1]});
		});
	});
});

function render(days) {
	var ideal = days.ideal;
	var actual = days.actual;
	$('#svg').empty();
	var rect = $('#graph')[0].getBoundingClientRect();
	var width = rect.width;
	var height = rect.height;
	var margin = {top:30, right:30, bottom:40, left:50};
	width -= margin.right + margin.left;
	height -= margin.top + margin.bottom;

	var x = d3.time.scale().range([0, width]);
	var y = d3.scale.linear().range([height, 0]);
	x.domain([ideal[0].date, ideal[ideal.length-1].date]);
	y.domain([0, ideal[0].points]).nice();//TODO
	var xAxis = d3.svg.axis().scale(x).orient('bottom').tickSize(-height).tickFormat(function(d) {
		return d.getDate();
	}).ticks(5).tickPadding(10);
	var yAxis = d3.svg.axis().scale(y).orient('left').tickSize(-width).ticks(5).tickPadding(10);
	var svg = d3.select('#svg').append('svg').attr('width', rect.width).attr('height', rect.height).append('g');
	svg.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
	var gAxisX = svg.append('g').attr('class', 'x axis day').attr('transform', 'translate(0,' + height + ')').call(xAxis);
	//legand
	svg.selectAll('text.legend').data([{ label: 'Date', x: width - 20, y: height + 30 },{ label: 'Point', x: -40, y:0 }]).enter().append('text')
		.attr('x', function(d) { return d.x; })
		.attr('y', function(d) { return d.y; })
		.text(function(d){
			return d.label;
		});

	svg.append('g').attr('class', 'y axis').call(yAxis);

	var line = d3.svg.line().interpolate('linear').x(function(d) {
		return x(d.date);
	}).y(function(d) {
		return y(d.points);
	});
	//today mark
	svg.append('svg:line').attr('class', 'today')
		.attr("x1", x(new Date()))
		.attr("y1", 0)
		.attr("x2", x(new Date()))
		.attr("y2", height);

	//ideal line
	svg.append('path').attr('class', 'ideal line').attr('d', line.interpolate('basis')(ideal));
	//actual line
	svg.append('path').attr('class', 'actual line').attr('d', line.interpolate('linear').y(function(d){
		return y(d.points);
	})(actual));

	svg.selectAll("a.issue").data(actual.slice(1)).enter().append('svg:a').attr("xlink:href", function(d) {
		return d.html_url;
	}).attr("xlink:show", 'new').append('svg:circle').attr("cx", function(d) {
		return x(d.date);
	}).attr("cy", function(d) {
		return y(d.points);
	}).attr("r", function(d) {
		return 5;
	});
}

function actualProgress(issues, begin, total, callback) {
	//sort the closed issues.
	async.sortBy(issues, function(item, cb) {
		cb(null, item.closed_at);
	}, function(err, sortedIssues) {
		var head = [ { date: new Date(begin), points: total } ];
		var min = +Infinity;//TODO no used
		var max = -Infinity;
		for (var i = 0; i < sortedIssues.length; i++) {
			var closed_at = sortedIssues[i].closed_at;
			var size = sortedIssues[i].gissue.size;
			if (size > max) {
				max = size;
			}
			if (size < min) {
				min = size;
			}
			sortedIssues[i].date = new Date(closed_at);
			total -= size;
			sortedIssues[i].points = total;
		}
		callback(null, head.concat(sortedIssues));
	});

}
function idealProgress(begin, due_on, total, callback) {
	var days = [];
	var end = new Date(due_on);
	end = new Date(end.getFullYear(), end.getMonth(), end.getDate());
	var beginDate = new Date(begin);
	var y = beginDate.getFullYear();
	var m = beginDate.getMonth();
	var d = beginDate.getDate();

	var workingDayNum = 0;
	var calculateDays = function() {
		var day = new Date(y, m, d);
		if (day.getDay() === 0 || day.getDay() === 6 ) {
			days.push({ date: day, noWorkingDay: true });
		} else {
			if (day <= end) {//do not count last point as a working day
				workingDayNum++;
			}
			days.push({ date: day });
		}
		if (day <= end) {
			d++;
			calculateDays();
		}
	};
	calculateDays();
	var velocity = total / workingDayNum;
	async.map(days, function(item, cb) {
		item.points = total;
		//skip the reduction of velocity if it's sunday or saturday.
		if (!item.noWorkingDay) {
			total -= velocity;
		}
		cb(null, item);
	},function(err, results) {
		callback(null, results);
	});
}

function loadMilestones(callback) {
	if (!options.milestone) {
		callback('No milestone specified');
		return;
	}
	var url = 'https://api.github.com/repos/' + options.repo + '/milestones/' + options.milestone +
		'?' + options.access_token;
	$.ajax({
		url: url,
		dataType: 'json',
		error: function (xhr, textStatus, errorThrown) {
			callback(errorThrown);
		},
		success: function (data, textStatus, xhr) {
			callback(null, data);
		}
	});


}

//TODO duplicated with the funtions in gissues.js
function parseOptions() {
	parseOption('repo');
	parseOption('milestone');
	parseOption('sprintSize');
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
		dataType: 'json',
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
