'use strict';
var os = require('os'),
	fs = require('fs'),
	path = require('path'),
	https = require('https'),
	webpack = require('webpack'),
	minimize = !process.argv.includes('-fast'),
	create_script = (script, compiler = webpack({
		entry: script.entry,
		output: { path: path.dirname(script.output), filename: path.basename(script.output) },
		module: { rules: [ { test: /\.css$/, use: [ { loader: path.join(__dirname, 'src', 'css.js'), options: {} } ] } ] },
		optimization: { minimize: minimize },
		plugins: [
			{ apply: compiler => compiler.hooks.thisCompilation.tap('Replace', compilation => compilation.hooks.processAssets.tap({ name: 'Replace', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT }, () => {
				var file = compilation.getAsset(compiler.options.output.filename),
					spackage = script.package(),
					extracted = new Date(),
					rmeta = {
						name: spackage.name,
						author: spackage.author,
						source: 'https://github.com/e9x/kru',
						version: spackage.version,
						license: spackage.license,
						namespace: spackage.homepage,
						supportURL: spackage.bugs.url,
						extracted: extracted.toGMTString(),
						include: /^https?:\/\/(internal\.|comp\.)?(krunker\.io|browserfps\.com)\/*?(index.html)?(\?|$)/,
						'run-at': 'document-start',
						grant: script.no_grants ? 'none' : [ 'GM_setValue', 'GM_getValue', 'GM_xmlhttpRequest' ],
						connect: [ 'sys32.dev', 'githubusercontent.com' ],
					},
					meta = Object.entries(rmeta).flatMap(([ key, val ]) => Array.isArray(val) ? val.map(val => [ key, val ]) : [ [ key, val ] ]),
					whitespace = meta.map(meta => meta[0]).sort((a, b) => b.toString().length - a.toString().length)[0].length + 8,
					source = file.source.source().replace(/build_extracted/g, extracted.getTime());
				
				if(minimize && source.split('\n')[0].startsWith('/*'))source = source.split('\n').slice(1).join('\n');
				
				compilation.updateAsset(file.name, new webpack.sources.RawSource(`// ==UserScript==
${meta.map(([ key, val ]) => ('// @' + key).padEnd(whitespace, ' ') + val.toString()).join('\n')}
// ==/UserScript==
// For any concerns regarding minified code, you are encouraged to build from the source
// For license information please see https://raw.githubusercontent.com/e9x/kru/master/sploit.user.js.LICENSE.txt
${(script.after || []).join('\n')}
${source}`));
			})) },
		],
	}, (err, stats) => {
		if(err)return console.error(err);
		
		compiler[process.argv.includes('-once') ? 'run' : 'watch']({}, (err, stats) => {
			var error = !!(err || stats.compilation.errors.length);
			
			for(var ind = 0; ind < stats.compilation.errors.length; ind++)error = true, console.error(stats.compilation.errors[ind]);
			if(err)console.error(err);
			
			if(error)return console.error('Build of', script.output, 'failed');
			else console.log('Build of', script.output, 'success');
		});
	})) => 1;

create_script({
	package(){
		return {
			name: 'Junker',
			author: 'SkidLamer',
			version: '1.0',
			bugs: { url: 'https://e9x.github.io/kru/inv/' },
			homepage: 'https://skidlamer.github.io/',
			license: 'BSD-3-Clause',
			repository: { type: 'git', url: 'git+https://github.com/e9x/kru.git' },
		};
	},
	after: [
		``,
		`// Donations Accepted`,
		`// BTC:  3CsDVq96KgmyPjktUe1YgVSurJVe7LT53G`,
		`// ETH:  0x5dbF713F95F7777c84e6EFF5080e2f0e0724E8b1`,
		`// ETC:  0xF59BEbe25ECe2ac3373477B5067E07F2284C70f3`,
		`// Amazon Giftcard - skidlamer@mail.com`,
		``,
	],
	// window is another context when grants are given, never noticed this in sploit
	no_grants: true,
	entry: path.join(__dirname, 'junker', 'index.js'),
	output: path.join(__dirname, 'junker.user.js'),
});

create_script({
	package(){
		return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')));
	},
	entry: path.join(__dirname, 'src', 'index.js'),
	output: path.join(__dirname, 'sploit.user.js'),
});