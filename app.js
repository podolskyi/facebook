var express = require('express');
var app = express();
var server = require('http').Server(app);
var _ = require('lodash');
var moment = require('moment');
var bodyParser = require('body-parser');
var Promise = require('bluebird');
var mongodb = Promise.promisifyAll(require('mongodb'));
var debug = require('debug')('fbtrex');
var nconf = require('nconf');
var pug = require('pug');
var cors = require('cors');

var utils = require('./lib/utils');
var escviAPI = require('./lib/allversions');
var performa = require('./lib/performa');
var mongo = require('./lib/mongo');

var cfgFile = "config/settings.json";
var redOn = "\033[31m";
var redOff = "\033[0m";

nconf.argv()
     .env()
     .file({ file: cfgFile })
     .file('users', { file: "config/users.json" });

console.log(redOn + "ઉ nconf loaded, using " + cfgFile + redOff);

var returnHTTPError = function(req, res, funcName, where) {
    debug("%s HTTP error 500 %s [%s]", req.randomUnicode, funcName, where);
    res.status(500);
    res.send();
    return false;
};


/* This function wraps all the API call, checking the verionNumber
 * managing error in 4XX/5XX messages and making all these asyncronous
 * I/O with DB, inside this Bluebird */
var inc = 0;
function dispatchPromise(name, req, res) {

    var apiV = _.parseInt(_.get(req.params, 'version'));

    /* force version to the only supported version */
    if(_.isNaN(apiV) || (apiV).constructor !== Number || apiV != 1)
        apiV = 1;

    if(_.isUndefined(req.randomUnicode)) {
        req.randomUnicode = inc;
        inc += 1;
    }

    debug("%s %s API v%d name %s (%s)", req.randomUnicode,
        moment().format("HH:mm:ss"), apiV, name, req.url);

    var func = _.get(escviAPI.implementations, name, null);

    if(_.isNull(func))
        return returnHTTPError(req, res, name, "Not a function request");

    /* in theory here we can keep track of time */
    return new Promise.resolve(func(req))
      .then(function(httpresult) {

          if(_.isObject(httpresult.headers))
              _.each(httpresult.headers, function(value, key) {
                  debug("Setting header %s: %s", key, value);
                  res.setHeader(key, value);
              });

          if(httpresult.json) {
              debug("%s API %s success, returning JSON (%d bytes)",
                  req.randomUnicode, name,
                  _.size(JSON.stringify(httpresult.json)) );
              res.json(httpresult.json)
          } else if(httpresult.text) {
              debug("%s API %s success, returning text (size %d)",
                  req.randomUnicode, name, _.size(httpresult.text));
              res.send(httpresult.text)
          } else if(httpresult.file) {
              /* this is used for special files, beside the css/js below */
              debug("%s API %s success, returning file (%s)",
                  req.randomUnicode, name, httpresult.file);
              res.sendFile(__dirname + "/html/" + httpresult.file);
          } else {
              debug("Undetermined failure in API call, result →  %j", httpresult);
              console.trace();
              return returnHTTPError(req, res, name, "Undetermined failure");
          }
          return true;
      })
      .catch(function(error) {
          debug("%s Trigger an Exception %s: %s",
              req.randomUnicode, name, error);
          return returnHTTPError(req, res, name, "Exception");
      });
};

/* everything begin here, welcome */
server.listen(nconf.get('port'), nconf.get('interface'));
console.log(" Listening on " + nconf.get('interface') + ":" + nconf.get('port'));
/* configuration of express4 */
app.use(cors());
app.use(bodyParser.json({limit: '4mb'}));
app.use(bodyParser.urlencoded({limit: '4mb', extended: true}));

app.get('/api/v:version/node/info', function(req, res) {
    return dispatchPromise('nodeInfo', req, res);
});

/* byDay (impressions, users, metadata ) -- discontinued GUI */
app.get('/api/v:version/daily/:what/:dayback', function(req, res) {
    return dispatchPromise('byDayStats', req, res);
});
/* actually used APIs for stats/impact */
app.get('/api/v:version/stats/:what/:months', function(req, res) {
    return dispatchPromise('getStats', req, res);
});
app.get('/api/v:version/stats/engagement', function(req, res) {
    return dispatchPromise('getEngagement', req, res);
});

/* column only - c3 */
app.get('/api/v:version/node/countries/c3', function(req, res) {
    return dispatchPromise('countriesStats', req, res);
});

app.get('/api/v:version/user/:kind/:CPN/:userId/:format', function(req, res){
    return dispatchPromise('userAnalysis', req, res);
});

/* Querying API */
app.post('/api/v:version/query', function(req, res) {
    return dispatchPromise('queryContent', req, res);
});

/* Parser API */
app.post('/api/v:version/snippet/status', function(req, res) {
    return dispatchPromise('snippetAvailable', req, res);
});
app.post('/api/v:version/snippet/content', function(req, res) {
    return dispatchPromise('snippetContent', req, res);
});
app.post('/api/v:version/snippet/result', function(req, res) {
    return dispatchPromise('snippetResult', req, res);
});


/* This is import and validate the key */
app.post('/api/v:version/validate', function(req, res) {
    return dispatchPromise('validateKey', req, res);
});
/* This to actually post the event collection */
app.post('/api/v:version/events', function(req, res) {
    return dispatchPromise('processEvents', req, res);
});


/* HTML single snippet */
app.get('/api/v:version/html/:htmlId', function(req, res) {
    return dispatchPromise('unitById', req, res);
});

/* APIs used in RealityCheck */
app.get('/api/v:version/htmls/:userId/days/:days', function(req, res) {
    return dispatchPromise('metadataByTime', req, res);
});
app.get('/api/v:version/htmls/:userId/n/:skip/:amount', function(req, res) {
    return dispatchPromise('metadataByAmount', req, res);
});
app.get('/api/v:version/personal/csv/:userId/:kind', function(req, res) {
    return dispatchPromise('personalCSV', req, res);
});

/* Alarm listing  API */
app.get('/api/v1/alarms/:auth', function(req, res) {
    return dispatchPromise('getAlarms', req, res);
});

/* realityMeter API(s) */
app.get('/api/v1/posts/top', function(req, res) {
    return dispatchPromise('getTopPosts', req, res);
});
app.get('/api/v1/realitymeter/:postId', function(req, res) {
    return dispatchPromise('postReality', req, res);
});

/* stats */
app.get('/impact', function(req, res) {
    return dispatchPromise('getImpact', req, res);
});

/* first class line jumper */
app.get('/api/v1/manualboarding', function(req, res) {
    return dispatchPromise('manualBoarding', req, res);
});

/* hyperlink extraction */
app.get('/api/v1/opendata/href/:campaign?/:max?', function(req, res) {
    return dispatchPromise('openDataHref', req, res);
});

/* selector experiment */
app.get('/api/v1/selector', function(req, res) {
    return dispatchPromise('getSelector', req, res);
});

/* static files, independent by the API versioning */
app.get('/favicon.ico', function(req, res) {
    res.sendFile(__dirname + '/dist/favicon.ico');
});
app.get('/robots.txt', function(req, res) {
    res.sendFile(__dirname + '/dist/robots.txt');
});


/* development: the local JS are pick w/out "npm run build" every time, and
 * our locally developed scripts stay in /js/local */
if(nconf.get('development') === 'true') {
    console.log(redOn + "ઉ DEVELOPMENT = serving JS from src" + redOff);
    app.use('/js/local', express.static(__dirname + '/sections/webscripts'));
} else {
    app.use('/js/local', express.static(__dirname + '/dist/js/local'));
}

/* catch the other 'vendor' script in /js */
app.use('/js', express.static(__dirname + '/dist/js'));
app.use('/css', express.static(__dirname + '/dist/css'));
app.use('/images', express.static(__dirname + '/dist/images'));
app.use('/fonts', express.static(__dirname + '/dist/fonts'));
app.use('/autoscroll.user.js', express.static(__dirname + '/I/autoscroll.user.js'));

/* special pages: the parameters are acquired by JS client side */
app.get('/realitycheck/:userId/:detail', function(req, res) {
    req.params.page = 'realitycheck';
    return dispatchPromise('getPage', req, res);
});
app.get('/revision/:htmlId', function(req, res) {
    req.params.page = 'revision';
    return dispatchPromise('getPage', req, res);
});

/* last one, page name catch-all */
app.get('/:page*', function(req, res) {
    return dispatchPromise('getPage', req, res);
});
/* true last */
app.get('/', function(req, res) {
    return dispatchPromise('getPage', req, res);
});


function infiniteLoop() {
    /* this will launch other scheduled tasks too */
    return Promise
        .resolve()
        .delay(60 * 1000)
        .then(function() {
            if(_.size(performa.queue))
                return mongo
                    .cacheFlush(performa.queue, "performa")
        })
        .then(infiniteLoop);
};

infiniteLoop();
