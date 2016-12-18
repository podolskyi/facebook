#!/usr/bin/env nodejs
var _ = require('lodash');
var cheerio = require('cheerio');
var moment = require('moment');
var debug = require('debug')('feedReactions');
var parse = require('./lib/parse');
var entities = require('entities');
var nconf = require('nconf'); 

var postcount = 0;
var errorcount = 0;
	
nconf.set("PARSER_FEEDREACTIONS_VERSION", "201612.01");

function getFeedReactions(snippet) {

	var reactions = {"_total": 0};
	
	var error = 0;
	
	var e_threshold;
	var e_container;
	var e_ptr;
	
	postcount ++;
	
    var $ = cheerio.load(snippet.html);
    
    e_threshold = $('div[data-reactroot] div._ipp');
    e_threshold.find("a[aria-label]").each(function() {
		var data = $(this).attr("aria-label").split(" ");
		reactions[data[1].toLowerCase()] = data[0];
		reactions._total += parseInt(data[0]);
		found = true;
	});
	
	if (!found) {
		debug("#" + postcount + ": reactions [" + snippet._id + "] NOT FOUND");
		error = 1;
		errorcount++;
	} else {
		debug("#" + postcount + ": reactions [" + snippet._id + "] : " + JSON.stringify(reactions));
	}
	
	if (error == 0)
		return {"postReactions": JSON.stringify(reactions)};

};

return parse.please({
    'name': 'feedReactions', /* this name is the same in parsers-key */
    'requirements': {'postType': 'feed'},
    'implementation': getFeedReactions,
    'since': "2016-09-13",
    'until': moment().toISOString(),
});

