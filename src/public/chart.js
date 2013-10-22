(function($){

parseOptions();
loadMilestones(function(err, milestone) {
	if (err) {
		return console.log(err);
	}
	var total = 15;
	//for (var i = 0; i < issues.length; i++) {
	//	total += issues[i].gissue.size;
	//}
	idealProgress(milestone.created_at, milestone.due_on, total, function(error, days) {
		console.log(days.length);//TODO debug
		render(days);
	});
});
function render(days) {
	$("#svg").empty();
	var rect = $("#graph")[0].getBoundingClientRect();
	var width = rect.width;
	var height = rect.height;
	var margin = {top:30, right:30, bottom:40, left:50};
	width -= margin.right + margin.left;
	height -= margin.top + margin.bottom;
	var x = d3.time.scale().range([0, width]);
	x.domain([days[0].date, days[days.length-1].date]);
	var xAxis = d3.svg.axis().scale(x).orient("bottom").tickSize(-height).tickFormat(function(d) {
		return d.getDate();
	}).ticks(5).tickPadding(10);
	var svg = d3.select("#svg").append("svg").attr("width", rect.width).attr("height", rect.height).append("g");
	svg.attr("transform", "translate(" + margin.left + "," + margin.top + ")");
	svg.append("g").attr("class", "x axis day").attr("transform", "translate(0," + height + ")").call(xAxis);
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
	var velocity = total / days.length;
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
	//GET /repos/:owner/:repo/milestones/:number
	var url = 'https://api.github.com/repos/' + options.repo + '/milestones/' + options.milestone;
	$.ajax({
		url: url,
		error: function (xhr, textStatus, errorThrown) {
			callback(errorThrown);
		},
		success: function (data, textStatus, xhr) {
			callback(null, data);
		}
	});


}
function loadIssues() {
	var page = 1;
	var state = 'open';
	var url = 'https://api.github.com/repos/' + options.repo + '/issues' + 
		'?' + options.access_token + 
		'&per_page=100' +
		'&page=' + page +
		'&state=' + state +
		'&milestone=' + encodeURIComponent(options.milestone);

}

//TODO duplicated with the funtions in gissues.js
function parseOptions() {
	options.repo = getQueryParam('repo');
	parseOption('labels');
	parseOption('assignee');
	parseOption('mentioned');
	parseOption('milestone');
}
function getQueryParam(name) {
	name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
	var regexS = "[\\?&]" + name + "=([^&#]*)";
	var regex = new RegExp(regexS);
	var results = regex.exec(window.location.href);
	return results === null ? undefined : decodeURIComponent(results[1].replace(/\+/g, " "));
}
function parseOption(option) {
	options[option] = getQueryParam(option);
	if (options[option]) {
		$('#' + option).val(options[option]);
	}
}

}(jQuery));
