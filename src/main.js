'use strict';
var Utils = require('./libs/utils'),
	Updater = require('./libs/updater.js'),
	API = require('./libs/api'),
	constants = require('./consts'),
	input = require('./input'),
	visual = require('./visual'),
	entries = require('./entries.js'),
	msgpack = require('msgpack-lite'),
	utils = new Utils(),
	updater = new Updater(constants.script, constants.extracted),
	api = new API(constants.mm_url, constants.api_url),
	UI = require('./libs/ui'),
	cheat = {
		add: ent => Object.setPrototypeOf({ entity: typeof ent == 'object' && ent != null ? ent : {} }, cheat.player_wrap),
		syms: {
			procInputs: Symbol(),
			hooked: Symbol(),
			isAI: Symbol(),
		},
		config: {},
		config_base: entries.base_config,
		vars: {},
		find_vars: {
			isYou: [/this\.accid=0,this\.(\w+)=\w+,this\.isPlayer/, 1],
			inView: [/&&!\w\.\w+&&\w\.\w+&&\w\.(\w+)\){/, 1],
			pchObjc: [/0,this\.(\w+)=new \w+\.Object3D,this/, 1],
			aimVal: [/this\.(\w+)-=1\/\(this\.weapon\.aimSpd/, 1],
			crouchVal: [/this\.(\w+)\+=\w\.crouchSpd\*\w+,1<=this\.\w+/, 1],
			didShoot: [/--,\w+\.(\w+)=!0/, 1],
			ammos: [/length;for\(\w+=0;\w+<\w+\.(\w+)\.length/, 1],
			weaponIndex: [/\.weaponConfig\[\w+]\.secondary&&\(\w+\.(\w+)==\w+/, 1],
			maxHealth: [/\.regenDelay,this\.(\w+)=\w+\.mode&&\w+\.mode\.\1/, 1],
			yVel: [/\w+\.(\w+)&&\(\w+\.y\+=\w+\.\1\*/, 1],
			mouseDownR: [/this\.(\w+)=0,this\.keys=/, 1], 
			recoilAnimY: [/\.\w+=0,this\.(\w+)=0,this\.\w+=0,this\.\w+=1,this\.slide/, 1],
			procInputs: [/this\.(\w+)=function\(\w+,\w+,\w+,\w+\){this\.recon/, 1],
			objInstances: [/lowerBody\),\w+\|\|\w+\.(\w+)\./, 1],
			getWorldPosition: [/var \w+=\w+\.camera\.(\w+)\(\);/, 1],
		},
		patches: [
			[/(&&(\w+)\.\w+&&)(\2\.cnBSeen)(\){if\(\(\w+=\2\.objInstances\.pos)/, '$1ssv.n($3)$4'],
			[/this\.moveObj=func/, 'ssv.g(this),$&'],
			[/(\((\w+),\w+,\w+\){)([a-z ';\.\(\),]+ACESFilmic)/, '$1ssv.t($2);$3'],
			[/this\.backgroundScene=/, 'ssv.w(this),$&'],
			[/((?:[a-zA-Z]+(\.|(?=\.skins)))+)\.skins(?!=)/g, 'ssv.p($1)'],
		],
		get draw_box(){
			return cheat.config.esp.status == 'box' || cheat.config.esp.status == 'box_chams' || cheat.config.esp.status == 'full';
		},
		get draw_chams(){
			return cheat.config.esp.status == 'chams' || cheat.config.esp.status == 'box_chams' || cheat.config.esp.status == 'full';
		},
		skins: [...Array(5000)].map((e, i) => ({ ind: i, cnt: 1 })),
		player_wrap: {
			distanceTo(p){return Math.hypot(this.x-p.x,this.y-p.y,this.z-p.z)},
			project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)},
			applyMatrix4(t){var e=this.x,n=this.y,r=this.z,i=t.elements,a=1/(i[3]*e+i[7]*n+i[11]*r+i[15]);return this.x=(i[0]*e+i[4]*n+i[8]*r+i[12])*a,this.y=(i[1]*e+i[5]*n+i[9]*r+i[13])*a,this.z=(i[2]*e+i[6]*n+i[10]*r+i[14])*a,this},
			get x(){ return this.entity.x || 0 },
			get y(){ return this.entity.y || 0 },
			get z(){ return this.entity.z || 0 },
			get can_see(){ return this.entity.can_see },
			get in_fov(){
				if(!this.active)return false;
				if(cheat.config.aim.fov == 110)return true;
				
				var fov_bak = cheat.world.camera.fov;
				
				// config fov is percentage of current fov
				cheat.world.camera.fov = cheat.config.aim.fov / fov_bak * 100;
				cheat.world.camera.updateProjectionMatrix();
				
				cheat.update_frustum();
				var ret = this.frustum;
				
				cheat.world.camera.fov = fov_bak;
				cheat.world.camera.updateProjectionMatrix();
				
				return ret;
			},
			get can_target(){
				return this.active && this.enemy && this.can_see && this.in_fov;
			},
			get frustum(){
				if(!this.active)return false;
				
				for(var ind = 0; ind < 6; ind++)if(cheat.world.frustum.planes[ind].distanceToPoint(this) < 0)return false;
				
				return true;
			},
			get esp_color(){
				// teammate = green, enemy = red, risk + enemy = orange
				var hex = this.enemy ? this.risk ? [ 0xFF, 0x77, 0x00 ] : [ 0xFF, 0x00, 0x00 ] : [ 0x00, 0xFF, 0x00 ],
					inc = this.can_see ? 0x00 : -0x77,
					part_str = part => Math.max(Math.min(part + inc, 0xFF), 0).toString(16).padStart(2, 0);
				
				return '#' + hex.map(part_str).join('');
			},
			get jump_bob_y(){ return this.entity.jumpBobY },
			get clan(){ return this.entity.clan },
			get alias(){ return this.entity.alias },
			get weapon(){ return this.entity.weapon },
			get can_slide(){ return this.entity.canSlide },
			get risk(){ return this.entity.isDev || this.entity.isMod || this.entity.isMapMod || this.entity.canGlobalKick || this.entity.canViewReports || this.entity.partnerApp || this.entity.canVerify || this.entity.canTeleport || this.entity.isKPDMode || this.entity.level >= 30 },
			get is_you(){ return this.entity[cheat.vars.isYou] },
			get aim_val(){ return this.entity[cheat.vars.aimVal] },
			get y_vel(){ return this.entity[cheat.vars.yVel] },
			get aim(){ return this.weapon.noAim || !this.aim_val || cheat.target && cheat.target.active && this.weapon.melee && this.distanceTo(cheat.target) <= 18 },
			get aim_press(){ return cheat.controls[cheat.vars.mouseDownR] || cheat.controls.keys[cheat.controls.binds.aim.val] },
			get crouch(){ return this.entity[cheat.vars.crouchVal] },
			rect(){
				/* hitbox:
				src_pos_crouch = constants.utils.pos2d(this, this.height),
				width = ~~((src_pos.y - constants.utils.pos2d(this, this.entity.height).y) * 0.7),
				height = src_pos.y - src_pos_crouch.y,
				center = {
					x: src_pos.x,
					y: src_pos.y - height / 2,
				};*/
				
				/*var src_pos = constants.utils.pos2d(this);
				
				var box3 = new cheat.three.Box3();
				
				box3.setFromObject(this.obj);
				
				var min = constants.utils.pos2d(box3.min),
					max = constants.utils.pos2d(box3.max),
					width = max.x - min.x,
					height = max.y - min.y,
					center = constants.utils.pos2d(box3.getCenter());
				*/
				
				/*
				// esp is not always straight rectangle
				x: center.x,
				y: center.y,
				left: center.x - width / 2,
				top: center.y - height / 2,
				right: center.x + width / 2,
				bottom: center.y + height / 2,
				width: width,
				height: height,
				*/
				
				/*return {
					x: center.x,
					y: center.y,
					min: min,
					max: max,
				};*/
				
				var src_pos = constants.utils.pos2d(this),
					src_pos_crouch = constants.utils.pos2d(this, this.height),
					width = ~~((src_pos.y - constants.utils.pos2d(this, this.entity.height).y) * 0.7),
					height = src_pos.y - src_pos_crouch.y,
					center = {
						x: src_pos.x,
						y: src_pos.y - height / 2,
					};
				
				return {
					x: center.x,
					y: center.y,
					left: center.x - width / 2,
					top: center.y - height / 2,
					right: center.x + width / 2,
					bottom: center.y + height / 2,
					width: width,
					height: height,
				};
			},
			distance_camera(){
				return cheat.world.camera[cheat.vars.getWorldPosition]().distanceTo(this);
			},
			get obj(){ return this.entity[cheat.vars.objInstances] },
			get recoil_y(){ return this.entity[cheat.vars.recoilAnimY] },
			get has_ammo(){ return this.weapon.melee || this.ammo },
			get ammo(){ return this.entity[cheat.vars.ammos][this.entity[cheat.vars.weaponIndex]] },
			get height(){ return (this.entity.height || 0) - this.entity[cheat.vars.crouchVal] * 3 },
			get health(){ return this.entity.health || 0 },
			get max_health(){ return this.entity[cheat.vars.maxHealth] || 100 },
			get active(){ return this.entity.active && this.entity.x != null && this.health > 0 && this.obj != null },
			get teammate(){ return this.is_you || cheat.player && this.team && this.team == cheat.player.team },
			get enemy(){ return !this.teammate },
			get team(){ return this.entity.team },
			get auto_weapon(){ return !this.weapon.nAuto },
			get shot(){ return this.weapon.nAuto && this.entity[cheat.vars.didShoot] },
		},
		update_frustum(){
			cheat.world.frustum.setFromProjectionMatrix(new cheat.three.Matrix4().multiplyMatrices(cheat.world.camera.projectionMatrix, cheat.world.camera.matrixWorldInverse));
		},
		process(){
			if(cheat.game && cheat.world){
				cheat.controls = cheat.game.controls;
				
				for(var ent of cheat.game.players.list){
					let player = cheat.add(ent);
					
					if(!player.active)continue;
					
					if(player.is_you)cheat.player = player;
					
					if(cheat.player)player.entity.can_see = player.active && constants.utils.obstructing(cheat.player, player, cheat.player.weapon && cheat.player.weapon.pierce && cheat.config.aim.wallbangs) == null ? true : false;
					
					/*if(!player.entity[cheat.syms.hooked]){
						player.entity[cheat.syms.hooked] = true;
						
						var inview = player.entity[cheat.vars.inView];
						
						Object.defineProperty(player.entity, cheat.vars.inView, {
							get: _ => {
								cheat.update_frustum();
								
							},
							set: _ => inview = _,
						});
					}*/
					
					if(cheat.player && cheat.player.entity[cheat.vars.procInputs] && !cheat.player.entity[cheat.syms.procInputs]){
						cheat.player.entity[cheat.syms.procInputs] = cheat.player.entity[cheat.vars.procInputs];
						
						cheat.player.entity[cheat.vars.procInputs] = (data, ...args) => {
							if(cheat.controls && cheat.player.weapon)input.exec(data);
							
							return cheat.player.entity[cheat.syms.procInputs](data, ...args);
						};
					}
				}
			};
			
			visual.exec();
			
			requestAnimationFrame(cheat.process);
		},
		socket_id: 0,
		input: require('./input.js'),
		has_instruct: (str, inst) => cheat.instruction_holder && cheat.instruction_holder.textContent.trim().toLowerCase().includes(str),
	},
	resolve_page_load,
	page_load = new Promise(resolve => resolve_page_load = resolve);

new MutationObserver((muts, observer) => muts.forEach(mut => [...mut.addedNodes].forEach(node => {
	/*if(node.tagName == 'DIV' && node.id == 'instructionHolder'){
		cheat.instruction_holder = node;
		
		node.style.display = 'block';
		
		var instructions = node.querySelector('#instructions');
		
		if(!instructions)return console.warn('Instructions not found');
		
		instructions.style['text-align'] = 'center';
		
		instructions.innerHTML = `<img src="https://i.imgur.com/yzb2ZmS.gif" width="25%"></div><a href='https://skidlamer.github.io/wp/' target='_blank.'><div class="imageButton discordSocial"></a>`;
	}*/
	
	if(node.tagName != 'SCRIPT' || !node.textContent.includes('Yendis Entertainment'))return;
	
	observer.disconnect();
	node.textContent = '';
	
	resolve_page_load();
}))).observe(document, { childList: true, subtree: true });

UI.ready.then(() => {
	constants.utils.canvas = UI.canvas;
	
	cheat.ui = new UI.Config(entries.ui(cheat));
	
	cheat.ui.update(true).then(() => {
		var loading = {
			visible: cheat.config.game.custom_loading,
			node: utils.add_ele('div', UI.doc, { className: 'loading' }),
			show(){
				this.visible = true;
				this.update();
			},
			hide(){
				this.visible = false;
				this.update();
			},
			blur(){},
			focus(){},
			update(){
				this.node.style.opacity = this.visible ? 1 : 0;
				this.node.style['pointer-events'] = this.visible ? 'all' : 'none';
			},
		};
		
		loading.update();
		
		UI.panels.push(loading);
		
		utils.add_ele('div', loading.node);
		
		utils.add_ele('a', loading.node, { href: constants.discord, draggable: false});
		
		cheat.css_editor = new UI.Editor({
			tabs: cheat.config.game.css,
			store: constants.store,
			save(tabs){
				cheat.config.game.css = tabs;
				cheat.ui.config.save();
			},
		});
		
		api.source().then(krunker => {
			input.main(cheat, cheat.add);
			visual.main(cheat);
			cheat.process();
			
			// find variables
			var missing = {};
			
			for(var label in cheat.find_vars){
				var [ regex, index ] = cheat.find_vars[label];
				
				cheat.vars[label] = (krunker.match(regex) || 0)[index] || (missing[label] = cheat.find_vars[label], null);
			}
			
			console.log('Found vars:');
			console.table(cheat.vars);
			
			if(Object.keys(missing).length){
				console.log('Missing:');
				console.table(missing);
			}
			
			var process_interval = setInterval(() => {
				// 0x1, 0x2 = account & ip
				if(cheat.has_instruct('connection banned'))clearInterval(process_interval), localStorage.removeItem('krunker_token'), UI.alert([
					`<p>You were IP banned, Sploit has signed you out.\nSpoof your IP to bypass this ban with one of the following:</p>`,
					`<ul>`,
						`<li>Using your mobile hotspot</li>`,
						...constants.proxy_addons.filter(data => data[constants.supported_store]).map(data => `<li><a target='_blank' href=${JSON.stringify(data[constants.supported_store])}>${data.name}</a></li>`),
						`<li>Use a <a target="_blank" href=${JSON.stringify(constants.addon_url('Proxy VPN'))}>Proxy/VPN</a></li>`,
					`</ul>`,
				].join(''));
				
				if(!cheat.config.game.auto_respawn)return;
				
				if(cheat.has_instruct('game is full'))clearInterval(process_interval), location.assign('https://krunker.io');
				else if(cheat.has_instruct('disconnected'))clearInterval(process_interval), location.assign('https://krunker.io');
				else if(cheat.has_instruct('click to play') && !cheat.player.active)cheat.controls.toggle(true);
			}, 100);
			
			cheat.patches.forEach(([ regex, replace ]) => krunker = krunker.replace(regex, replace));
			
			api.media('sploit',cheat,constants);
			
			page_load.then(async () => new Function('WP_fetchMMToken', 'ssv', 'WebSocket', krunker)(api.token().finally(token => loading.hide()), {
				t(three_mod){ cheat.three = constants.utils.three = three_mod.exports },
				g(game){ cheat.game = constants.utils.game = game },
				w(world){ cheat.world = constants.utils.world = world },
				n: inview => cheat.config.esp.status == 'full' ? false : (cheat.config.esp.nametags || inview),
				p: ent => cheat.config.game.skins && typeof ent == 'object' && ent != null && ent.stats ? cheat.skins : ent.skins,
			}, class extends WebSocket {
				constructor(url, proto){
					super(url, proto);
					
					this.addEventListener('message', event => {
						var [ label, ...data ] = msgpack.decode(new Uint8Array(event.data)), client;
						
						if(label == 'io-init')cheat.socket_id = data[0];
						else if(cheat.config.game.skins && label == 0 && cheat.skin_cache && (client = data[0].indexOf(cheat.socket_id)) != -1){
							// loadout
							data[0][client + 12] = cheat.skin_cache[2];
							
							// hat
							data[0][client + 13] = cheat.skin_cache[3];
							
							// body
							data[0][client + 14] = cheat.skin_cache[4];
							
							// knife
							data[0][client + 19] = cheat.skin_cache[9];
							
							// dye
							data[0][client + 24] = cheat.skin_cache[14];
							
							// waist
							data[0][client + 33] = cheat.skin_cache[17];
							
							// event.data is non-writable but configurable
							// concat message signature ( 2 bytes )
							
							var encoded = msgpack.encode([ label, ...data ]),
								final = new Uint8Array(encoded.byteLength + 2);
							
							final.set(encoded, 0);
							final.set(event.data.slice(-2), encoded.byteLength);
							
							Object.defineProperty(event, 'data', { value: final.buffer });
						}
					});
				}
				send(data){
					var [ label, ...sdata ] = msgpack.decode(data.slice(0, -2));
					
					if(label == 'en')cheat.skin_cache = sdata[0];
					
					super.send(data);
				}
			}));
		});
	});
});

document.addEventListener('pointerlockchange', () => {
	cheat.focused = document.pointerLockElement != null;
});

// updater.poll();

window.addEventListener('load', () => {
	updater.watch(() => {
		if(confirm('A new Sploit version is available, do you wish to update?'))updater.update();
	}, 60e3 * 3);	
});