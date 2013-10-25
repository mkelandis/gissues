// supervisor -e "js|html|css" server.js

var express = require('express')
    , cluster = require('cluster')
    , http = require('http')
    , https = require('https')
    , config = require('./config.json');

config.client_id = process.env.GITHUB_CLIENT_ID || config.client_id;
config.client_secret = process.env.GITHUB_CLIENT_SECRET || config.client_secret;
config.http_proxy = process.env.HTTP_PROXY || config.http_proxy;
config.port = process.env.PORT || config.port;

if (!config.client_id || !config.client_secret)
    throw new Error('config.json must contain an object with client_id and client_secret properties.')

if (config.client_id === 'please specify client_id for OAuth here')
    throw new Error('config.json must be updated with OAuth credentials for the application. Get them at https://github.com/settings/applications/new.')

var app = express.createServer();
var proxyOptions = undefined;

app.configure(function() {
    app.use(express.static(__dirname + '/public'));
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.set('view engine', 'ejs');
    app.set('views', __dirname + '/views');
    app.set("view options", { layout: false });
});

function processOAuthRequest(req, res) {
    var accessToken = req.param('code', undefined);
    // exchange OAuth access token for OAuth token

    var url = 'https://github.com/login/oauth/access_token'
        + '?client_id=' + config.client_id
        + '&client_secret=' + config.client_secret
        + '&code=' + accessToken;

    var processResponse = function(gres) {
        var body = '';
        gres.on('data', function(chunk) {
            body += chunk;
        });           
        gres.on('end', function() {
            if (gres.statusCode === 200 && body.indexOf('access_token') === 0) {
                var delim = '/?';
                var query= '';
                for (var p in req.query) {
                    if (req.query[p] && 'code' !== p) {
                        query += delim + p + '=' + encodeURIComponent(req.query[p]);
                        delim = '&';
                    }
                }
                res.cookie('access_token', body);
                res.redirect(query, 302);
            }
            else {
                console.log(new Date() +' error oauth: ' + gres.statusCode + ' ' + body);
                res.send('Error obtaining OAuth token. Status: ' + gres.statusCode + ', Body: ' + body);
            }
        }); 
    }

    var processError = function(error) {
        // TODO proper error message
        console.log(new Date() + ' error oauth: ' + error);
        res.send('Error obtaining OAuth token: ' + error.toString());            
    }

    if (proxyOptions) {
         // HTTPS request through HTTP proxy
        http.request({ // establishing a tunnel
          host: proxyOptions.host,
          port: proxyOptions.port,
          method: 'CONNECT',
          path: 'github.com:443'
        }).on('connect', function(pres, socket, head) {
            if (pres.statusCode !== 200) {
                processError('unable to connect to GitHub');
            }
            else {
                https.get({
                    host: 'github.com',
                    path: url,
                    socket: socket, // using a tunnel
                    agent: false    // cannot use a default agent
                }, processResponse).on('error', processError);
            }
        }).on('error', processError).end();
    }
    else {
        https.get({
            host: 'github.com',
            path: url
        }, processResponse).on('error', processError);
    }
}

app.get('/logout', function(req, res) {
    res.clearCookie('access_token');
    res.redirect('/', 302); 
});

app.get('/*', function (req, res, next) {
    if (req.cookies.access_token) {
	next();
    }
    else if (req.param('code', undefined)) {
        console.log(new Date() + ' get oauth');
        processOAuthRequest(req, res);
    }
    else {
        console.log(new Date() + ' get index: ' + req.url);
        res.render('index', config);
    }
});
app.get('/', function (req, res) {
        console.log(new Date() + ' get board: ' + req.url);
        res.render('whiteboard', {cookie: req.cookies, specifiedRepo: JSON.stringify(config.specifiedRepo)});
});
app.get('/burndown', function (req, res) {
        console.log(new Date() + ' get burndown: ' + req.url);
        res.render('chart', {cookie: req.cookies});
});


// supervisor does not seem to work well with cluster https://github.com/isaacs/node-supervisor/issues/40

// if (cluster.isMaster) {
//     for (var i = 0; i < 4; i++) {
//         cluster.fork();
//     }

//     cluster.on('death', function(worker) {
//         cluster.log('worker ' + worker.pid + ' died');
//     });
// }
// else {
app.listen(config.port || 80);
if (config.http_proxy) {
    var i = config.http_proxy.indexOf(':');
    proxyOptions = {
        host: i == -1 ? config.http_proxy : config.http_proxy.substring(0, i),
        port: i == -1 ? 80 : config.http_proxy.substring(i + 1)
    };
    console.log('Using proxy: ' + proxyOptions.host + ':' + proxyOptions.port);
}
console.log('Listening on port ' + (config.port || 80));
// }

