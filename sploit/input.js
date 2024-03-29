'use strict';
var cheat = require('./cheat'),
	vars = require('./libs/vars'),
	integrate = require('./libs/integrate'),
	{ utils } = require('./consts'),
	/*
	[
		controls.getISN(),
		Math.round(delta * game.config.deltaMlt),
		Math.round(1000 * controls.yDr.round(3)),
		Math.round(1000 * xDr.round(3)),
		game.moveLock ? -1 : config.movDirs.indexOf(controls.moveDir),
		controls.mouseDownL || controls.keys[controls.binds.shoot.val] ? 1 : 0,
		controls.mouseDownR || controls.keys[controls.binds.aim.val] ? 1 : 0,
		!Q.moveLock && controls.keys[controls.binds.jump.val] ? 1 : 0,
		controls.keys[controls.binds.reload.val] ? 1 : 0,
		controls.keys[controls.binds.crouch.val] ? 1 : 0,
		controls.scrollToSwap ? controls.scrollDelta * ue.tmp.scrollDir : 0,
		controls.wSwap,
		1 - controls.speedLmt.round(1),
		controls.keys[controls.binds.reset.val] ? 1 : 0,
		controls.keys[controls.binds.interact.val] ? 1 : 0
	];
	*/
	keys = { frame: 0, delta: 1, xdir: 2, ydir: 3, moveDir: 4, shoot: 5, scope: 6, jump: 7, reload: 8, crouch: 9, weaponScroll: 10, weaponSwap: 11, moveLock: 12 },
	sorts = {
		dist3d: (ent_1, ent_2) => ent_1.distanceTo(ent_2),
		dist2d: (ent_1, ent_2) => {
			if(!ent_1.rect)console.log(ent_1);
			
			return utils.dist_center(ent_1.rect()) - utils.dist_center(ent_2.rect());
		},
		hp: (ent_1, ent_2) => ent_1.health - ent_2.health,
	},
	smooth = target	=> {
		var aj = 17,
			// default 0.0022
			div = 10000,
			turn = (50 - cheat.config.aim.smooth) / div,
			speed = (50 - cheat.config.aim.smooth) / div,
			x_ang = utils.getAngleDst(cheat.controls[vars.pchObjc].rotation.x, target.xD),
			y_ang = utils.getAngleDst(cheat.controls.object.rotation.y, target.yD);
		
		return {
			y: cheat.controls.object.rotation.y + y_ang * aj * turn,
			x: cheat.controls[vars.pchObjc].rotation.x + x_ang * aj * turn,
		};
	},
	y_offset_types = ['head', 'chest', 'feet'],
	y_offset_rand = 'head',
	enemy_sight = () => {
		if(cheat.player.shot)return;
		
		var raycaster = new cheat.three.Raycaster();
		
		raycaster.setFromCamera({ x: 0, y: 0 }, cheat.world.camera);
		
		if(cheat.player.aim && raycaster.intersectObjects(cheat.game.players.list.map(cheat.add).filter(ent => ent.can_target).map(ent => ent.obj), true).length)return true;
	},
	aim_input = (rot, data) => {
		data.xdir = rot.x * 1000;
		data.ydir = rot.y * 1000;
	},
	aim_camera = rot => {
		cheat.controls[vars.pchObjc].rotation.x = rot.x;
		cheat.controls.object.rotation.y = rot.y;
	},
	correct_aim = (rot, data) => {
		if(data.shoot)data.shoot = !cheat.player.shot;
		
		if(data.shoot && !cheat.player.shot)aim_input(rot, data);
	};

class InputData {
	constructor(array){
		this.array = array;
	}
}

// keys = { frame: 0, delta: 1, xdir: 2, ydir: 3, moveDir: 4, shoot: 5, scope: 6, jump: 7, reload: 8, crouch: 9, weaponScroll: 10, weaponSwap: 11, moveLock: 12 },
for(let key in keys)Object.defineProperty(InputData.prototype, key, {
	get(){
		return this.array[keys[key]];
	},
	set(value){
		return this.array[keys[key]] = typeof value == 'boolean' ? +value : value;
	},
});

setInterval(() => y_offset_rand = y_offset_types[~~(Math.random() * y_offset_types.length)], 2000);

module.exports = array => {
	var data = new InputData(array);
	
	// bhop
	if(integrate.focused && cheat.config.game.bhop != 'off' && (integrate.inputs.Space || cheat.config.game.bhop == 'autojump' || cheat.config.game.bhop == 'autoslide')){
		cheat.controls.keys[cheat.controls.binds.jump.val] ^= 1;
		if(cheat.controls.keys[cheat.controls.binds.jump.val])cheat.controls.didPressed[cheat.controls.binds.jump.val] = 1;
		
		if((cheat.config.game.bhop == 'keyslide' && integrate.inputs.Space || cheat.config.game.bhop == 'autoslide') && cheat.player.y_vel < -0.02 && cheat.player.can_slide)setTimeout(() => cheat.controls.keys[cheat.controls.binds.crouch.val] = 0, 325), cheat.controls.keys[cheat.controls.binds.crouch.val] = 1;
	}
	
	// auto reload
	if(!cheat.player.has_ammo && (cheat.config.aim.status == 'auto' || cheat.config.aim.auto_reload))data.reload = 1;
	
	// aimbot
	var target = cheat.target = cheat.target && cheat.target.can_target ? cheat.target : cheat.game.players.list.map(cheat.add).filter(player => player.can_target).sort((ent_1, ent_2) => sorts[cheat.config.aim.target_sorting || 'dist2d'](ent_1, ent_2) * (ent_1.frustum ? 1 : 0.5))[0],
		can_shoot = !data.reloading && cheat.player.has_ammo;
	
	// todo: triggerbot delay
	if(can_shoot && cheat.config.aim.status == 'trigger')data.shoot = enemy_sight() || data.shoot;
	else if(can_shoot && cheat.config.aim.status != 'off' && target && cheat.player.health){
		var y_val = target.y + (target[cheat.syms.isAI] ? -(target.dat.mSize / 2) : (target.jump_bob_y * 0.072) + 1 - target.crouch * 3);
		
		switch(cheat.config.aim.offset != 'random' ? cheat.config.aim.offset : y_offset_rand){
			case'chest':
				y_val -= target.height / 2;
				break;
			case'feet':
				y_val -= target.height - target.height / 2.5;
				break;
		};
		
		var y_dire = utils.getDir(cheat.player.z, cheat.player.x, target.z, target.x),
			x_dire = utils.getXDire(cheat.player.x, cheat.player.y, cheat.player.z, target.x, y_val, target.z),
			rot = {
				x: utils.round(Math.max(-utils.halfpi, Math.min(utils.halfpi, x_dire - cheat.player.recoil_y * 0.27)) % utils.pi2, 3) || 0,
				y: utils.normal_radian(utils.round(y_dire % utils.pi2, 3)) || 0,
			},
			can_hit = (Math.random() * 100) < cheat.config.aim.hitchance;
		
		if(can_hit)if(cheat.config.aim.status == 'correction')correct_aim(rot, data);
		else if(cheat.config.aim.status == 'auto'){
			data.scope = 1;
			
			if(cheat.player.aim)data.shoot = cheat.player.shot ? 0 : 1;
			correct_aim(rot, data);
		}
		
		if(cheat.config.aim.status == 'assist' && cheat.player.aim_press){
			if(cheat.config.aim.smooth)rot = smooth({ xD: rot.x, yD: rot.y });
			
			aim_camera(rot);
			aim_input(rot, data);
			
			// offset aim rather than revert to any previous camera rotation
			if(!cheat.player.shot && !can_hit)data.ydir += 75;
		}
	}
	
	if(data.shoot && cheat.player.auto_weapon && !cheat.player.entity[cheat.syms.shot]){
		cheat.player.entity[cheat.syms.shot] = true;
		setTimeout(() => cheat.player.entity[cheat.syms.shot] = false, cheat.player.weapon.rate + 15);
	}
};