var parse_headers = script => {
	var out = {};
	
	script.replace(/\/\/ ==UserScript==\n([\s\S]*?)\n\/\/ ==\/UserScript==/, (match, headers) => headers.split('\n').forEach(line => line.replace(/@(\S+)\s+(.*)/, (match, label, value) => out[label] = label in out ? [].concat(out[label], value) : value)));
	
	return out;
};

var update_interval = setInterval(async () => {
	var current = new Date(parse_headers(GM_info.scriptSource).extracted).getTime(),
		latest = new Date(parse_headers(await fetch('https://raw.githubusercontent.com/e9x/kru/master/sploit.user.js').then(res => res.text())).extracted).getTime();
	
	if(current >= latest)return;
	
	clearInterval(update_interval);
	
	// outdated
	if(!confirm('A new sploit version is available, do you wish to update?'))return ;
	
}, 3000);