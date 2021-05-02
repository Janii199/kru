'use strict';

var ws = require('ws'),
	fs = require('fs'),
	edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36 Edg/90.0.818.51',
	path = require('path'),
	http = require('http'),
	https = require('https'),
	fetch = require('node-fetch'),
	webpack = require('webpack'),
	nodehttp = require('sys-nodehttp'),
	staticd = nodehttp.static(path.join(__dirname, 'public')),
	proxy = (slice_prefix, prefix, host, post_proc, after_proc) => server.use(prefix, async (req, res) => {
		var url = new URL('https://' + host + req.url.href.substr(req.url.origin.length + (slice_prefix ? prefix.length : 0)));
		
		if(post_proc)post_proc(req, res, url);
		
		var resp = await fetch(url, { headers: { 'user-agent': edge } });
		res.headers.set('content-type', resp.headers.get('content-type'));
		res.status(resp.status);
		
		res.send(after_proc ? after_proc(req, res, await resp.text()) : await resp.buffer());
	}),
	compiler = webpack({
		optimization: {
			minimize: false,
		},
		entry: path.join(__dirname, '..', 'src', 'index.js'),
		output: { path: staticd.root, filename: 'sploit.js' },
		module: { rules: [ { test: /\.css$/, use: [ { loader: path.join(__dirname, '..', 'src', 'css.js'), options: {} } ] } ] },
	}),
	server = new nodehttp.Server({ port: 5050, log: true });

compiler.watch({}, (err, stats) => {
	var error = !!(err || stats.compilation.errors.length);
	
	for(var ind = 0; ind < stats.compilation.errors.length; ind++)error = true, console.error(stats.compilation.errors[ind]);
	if(err)console.error(err);
	
	if(error)return console.error('One or more errors occured during building, refer to above console output for more info');
	
	console.log('Build success, output at', path.join(compiler.options.output.path, compiler.options.output.filename));
});

proxy(false, '/ping-list', 'matchmaker.krunker.io', (req, res, url) => url.searchParams.set('hostname', 'krunker.io'));

proxy(false, '/game-list', 'matchmaker.krunker.io', (req, res, url) => url.searchParams.set('hostname', 'krunker.io'));

proxy(true, '/social', 'social.krunker.io', (req, res, url) => url.searchParams.set('hostname', 'krunker.io'));

proxy(true, '/user-assets', 'social.krunker.io', (req, res, url) => url.searchParams.set('hostname', 'krunker.io'));

proxy(true, '/api', 'api.krunker.io');

proxy(false, '/game-info', 'matchmaker.krunker.io');

proxy(false, '/seek-game', 'matchmaker.krunker.io', (req, res, url) => url.searchParams.set('hostname', 'krunker.io'), (req, res, body) => {
	var json;
	try{ json = JSON.parse(body) }catch(err){ return console.error(err), body; }
	
	if(json.host)json.host = req.url.host + '?' + json.host;
	
	return JSON.stringify(json);
});

server.use(staticd);

server.get(async (req, res, next) => {
	var file = path.join(staticd.root, req.url.pathname),
		external = new URL(req.url.pathname, 'https://krunker.io');
	
	if(req.url.pathname.startsWith('/assets')){
		var asset = req.url.pathname.substr('/assets'.length);
		
		external = new URL(asset, 'https://assets.krunker.io');
	}
	
	var resp = await fetch(external, { headers: { 'user-agent': edge } });
	
	await fs.promises.mkdir(path.dirname(file), { recursive: true }).catch(_=>_);
	await fs.promises.writeFile(file, await resp.buffer());
	
	staticd(req, res, next);
});

server.ws('/', client => {
	if(!client.url.search)return;
	
	var socket = new ws('wss://' + client.url.search.slice(1), {
			headers: {
				'user-agent': edge,
				origin: 'https://krunker.io',
			},
		}),
		ready = false,
		missed = [];
	
	socket.on('open', () => {
		ready = true;
		missed.forEach(data => socket.send(data));
		missed = [];
	});
	
	client.on('message', data => {
		if(!ready)missed.push(data);
		else socket.send(data);
	});
	
	socket.on('message', data => {
		client.send(data);
	});
	
	socket.on('close', () => client.close());
	
	client.on('close', () => socket.close());
});