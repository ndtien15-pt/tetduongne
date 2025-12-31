"use strict";

const IS_MOBILE = window.innerWidth <= 640;
const IS_DESKTOP = window.innerWidth > 800;
const IS_HEADER = IS_DESKTOP && window.innerHeight < 300;
const IS_HIGH_END_DEVICE = (() => {
	const hwConcurrency = navigator.hardwareConcurrency;
	if (!hwConcurrency) return false;
	const minCount = window.innerWidth <= 1024 ? 4 : 8;
	return hwConcurrency >= minCount;
})();

const MAX_WIDTH = 7680;
const MAX_HEIGHT = 4320;
const GRAVITY = 0.9;
let simSpeed = 1;

function getDefaultScaleFactor() {
	if (IS_MOBILE) return 0.9;
	if (IS_HEADER) return 0.75;
	return 1;
}

let stageW, stageH;
let quality = 1;
let isLowQuality = false;
let isNormalQuality = false;
let isHighQuality = true;
const QUALITY_LOW = 1;
const QUALITY_NORMAL = 2;
const QUALITY_HIGH = 3;
const SKY_LIGHT_NONE = 0;
const SKY_LIGHT_DIM = 1;
const SKY_LIGHT_NORMAL = 2;

const COLOR = {
	Red: "#ff0043", Green: "#14fc56", Blue: "#1e7fff", Purple: "#e60aff", Gold: "#ffbf36", White: "#ffffff",
};

const INVISIBLE = "_INVISIBLE_";
const PI_2 = Math.PI * 2;
const PI_HALF = Math.PI * 0.5;

const trailsStage = new Stage("trails-canvas");
const mainStage = new Stage("main-canvas");
const stages = [trailsStage, mainStage];

// --- QUẢN LÝ ÂM THANH (GIỮ NGUYÊN) ---
const soundManager = {
	baseURL: "./", // Đổi đường dẫn nhạc về cùng thư mục gốc cho dễ
	ctx: new (window.AudioContext || window.webkitAudioContext)(),
	sources: {
        // Cấu hình âm thanh gốc (giả lập để code không lỗi)
		lift: { volume: 1, playbackRateMin: 0.85, playbackRateMax: 0.95, fileNames: ["lift1.mp3"] },
		burst: { volume: 1, playbackRateMin: 0.8, playbackRateMax: 0.9, fileNames: ["burst1.mp3"] },
		burstSmall: { volume: 0.25, playbackRateMin: 0.8, playbackRateMax: 1, fileNames: ["burst-sm-1.mp3"] },
		crackle: { volume: 0.2, playbackRateMin: 1, playbackRateMax: 1, fileNames: ["crackle1.mp3"] },
		crackleSmall: { volume: 0.3, playbackRateMin: 1, playbackRateMax: 1, fileNames: ["crackle-sm-1.mp3"] },
	},
	preload() {
        // Fake preload: Luôn trả về thành công để không chặn ứng dụng
        return Promise.resolve();
	},
	pauseAll() { this.ctx.suspend(); },
	resumeAll() { this.playSound("lift", 0); setTimeout(() => { this.ctx.resume(); }, 250); },
	playSound(type, scale = 1) {
        // Hàm này được giữ lại để logic pháo hoa gọi vào không bị lỗi crash
        // Nếu ông có file âm thanh thật thì bỏ comment đoạn dưới để chạy
        /*
		scale = MyMath.clamp(scale, 0, 1);
		if (!canPlaySoundSelector() || simSpeed < 0.95) return;
        // ... (Logic phát nhạc gốc đã được rút gọn để tránh lỗi file)
        */
	},
};

// --- STORE & CONFIG ---
const store = {
	state: {
		paused: true, soundEnabled: true, menuOpen: false, openHelpTopic: null, fullscreen: false,
		config: {
			quality: String(IS_HIGH_END_DEVICE ? QUALITY_HIGH : QUALITY_NORMAL),
			shell: "Random", size: IS_DESKTOP ? "3" : "2",
			wordShell: true, autoLaunch: false, // Tắt tự động bắn để chạy theo kịch bản
			finale: false, skyLighting: SKY_LIGHT_NORMAL + "",
			hideControls: true, longExposure: false, scaleFactor: getDefaultScaleFactor(),
		},
	},
	setState(nextState) {
		this.state = Object.assign({}, this.state, nextState);
		configDidUpdate();
	},
	subscribe(listener) {},
	load() {}, persist() {} // Bỏ qua load/save config phức tạp
};

function configDidUpdate() {
	const config = store.state.config;
	quality = +config.quality;
	isLowQuality = quality === QUALITY_LOW;
	isNormalQuality = quality === QUALITY_NORMAL;
	isHighQuality = quality === QUALITY_HIGH;
	Spark.drawWidth = quality === QUALITY_HIGH ? 0.75 : 1;
}

// Selectors
const isRunning = (state = store.state) => !state.paused && !state.menuOpen;
const soundEnabledSelector = (state = store.state) => state.soundEnabled;
const canPlaySoundSelector = (state = store.state) => isRunning(state) && soundEnabledSelector(state);
const shellSizeSelector = () => +store.state.config.size;

// --- INIT (KHỞI TẠO) ---
function init() {
    // Ẩn màn hình loading nếu có
    const loading = document.querySelector(".loading-screen");
    if(loading) loading.classList.add("remove");
    
	togglePause(false);
	configDidUpdate();
}

function togglePause(toggle) {
	const paused = store.state.paused;
	let newValue = typeof toggle === "boolean" ? toggle : !paused;
	if (paused !== newValue) store.setState({ paused: newValue });
}

// --- CONSTANTS & HELPERS ---
const COLOR_CODES = Object.keys(COLOR).map((colorName) => COLOR[colorName]);
const COLOR_CODES_W_INVIS = [...COLOR_CODES, INVISIBLE];
const COLOR_TUPLES = {};
COLOR_CODES.forEach((hex) => {
	COLOR_TUPLES[hex] = { r: parseInt(hex.substr(1, 2), 16), g: parseInt(hex.substr(3, 2), 16), b: parseInt(hex.substr(5, 2), 16) };
});

function randomColorSimple() { return COLOR_CODES[(Math.random() * COLOR_CODES.length) | 0]; }
function randomColor(options) { return randomColorSimple(); }
function whiteOrGold() { return Math.random() < 0.5 ? COLOR.Gold : COLOR.White; }

// --- SHELL DEFINITIONS (CÁC LOẠI PHÁO) ---
// Tôi giữ lại loại Crysanthemum (Cúc đại đóa) đẹp nhất
const crysanthemumShell = (size = 1) => {
	const glitter = Math.random() < 0.25;
	const singleColor = Math.random() < 0.72;
	const color = singleColor ? randomColor({ limitWhite: true }) : [randomColor(), randomColor({ notSame: true })];
	const pistil = singleColor && Math.random() < 0.42;
	const pistilColor = pistil && (color === COLOR.White || color === COLOR.Gold ? randomColor({ notColor: color }) : whiteOrGold());
	return {
		shellSize: size, spreadSize: 300 + size * 100, starLife: 900 + size * 200,
		starDensity: glitter ? 1.1 : 1.25, color, secondColor: null,
		glitter: glitter ? "light" : "", glitterColor: whiteOrGold(), pistil, pistilColor, streamers: !pistil && color !== COLOR.White && Math.random() < 0.42,
	};
};
const shellTypes = { Crysanthemum: crysanthemumShell };

// --- SHELL CLASS (VỎ PHÁO - LOGIC VẬT LÝ) ---
class Shell {
	constructor(options) {
		Object.assign(this, options);
		this.starLifeVariation = options.starLifeVariation || 0.125;
		this.color = options.color || randomColor();
		this.glitterColor = options.glitterColor || this.color;
		if (!this.starCount) {
			const density = options.starDensity || 1;
			const scaledSize = this.spreadSize / 54;
			this.starCount = Math.max(6, scaledSize * scaledSize * density);
		}
	}
	launch(position, launchHeight) {
		const width = stageW; const height = stageH;
		const hpad = 60; const vpad = 50; const minHeightPercent = 0.45; const minHeight = height - height * minHeightPercent;
		const launchX = position * (width - hpad * 2) + hpad; const launchY = height;
		const burstY = minHeight - launchHeight * (minHeight - vpad);
		const launchDistance = launchY - burstY;
		const launchVelocity = Math.pow(launchDistance * 0.04, 0.64);
		const comet = (this.comet = Star.add(launchX, launchY, typeof this.color === "string" && this.color !== "random" ? this.color : COLOR.White, Math.PI, launchVelocity * (this.horsetail ? 1.2 : 1), launchVelocity * (this.horsetail ? 100 : 400)));
		comet.heavy = true; comet.spinRadius = MyMath.random(0.32, 0.85); comet.sparkFreq = 32 / quality;
		if (isHighQuality) comet.sparkFreq = 8;
		comet.sparkLife = 320; comet.sparkLifeVariation = 3;
		if (this.glitter === "willow" || this.fallingLeaves) { comet.sparkFreq = 20 / quality; comet.sparkSpeed = 0.5; comet.sparkLife = 500; }
		if (this.color === INVISIBLE) comet.sparkColor = COLOR.Gold;
		comet.onDeath = (comet) => this.burst(comet.x, comet.y);
		soundManager.playSound("lift");
	}
	burst(x, y) {
		const speed = this.spreadSize / 96;
		let color, onDeath, sparkFreq, sparkSpeed, sparkLife;
		let sparkLifeVariation = 0.25;
		if (this.glitter === "light") { sparkFreq = 400; sparkSpeed = 0.3; sparkLife = 300; sparkLifeVariation = 2; }
        else if (this.glitter === "medium") { sparkFreq = 200; sparkSpeed = 0.44; sparkLife = 700; sparkLifeVariation = 2; }
		else if (this.glitter === "heavy") { sparkFreq = 80; sparkSpeed = 0.8; sparkLife = 1400; sparkLifeVariation = 2; }
		sparkFreq = sparkFreq / quality;

		const starFactory = (angle, speedMult) => {
			const star = Star.add(x, y, this.color || randomColor(), angle, speedMult * speed, this.starLife + Math.random() * this.starLife * this.starLifeVariation, this.horsetail ? this.comet && this.comet.speedX : 0, this.horsetail ? this.comet && this.comet.speedY : -this.spreadSize / 1800);
			if (this.secondColor) { star.transitionTime = this.starLife * (Math.random() * 0.05 + 0.32); star.secondColor = this.secondColor; }
			if (this.strobe) { star.transitionTime = this.starLife * (Math.random() * 0.08 + 0.46); star.strobe = true; star.strobeFreq = Math.random() * 20 + 40; if (this.strobeColor) star.secondColor = this.strobeColor; }
			star.onDeath = onDeath;
			if (this.glitter) { star.sparkFreq = sparkFreq; star.sparkSpeed = sparkSpeed; star.sparkLife = sparkLife; star.sparkLifeVariation = sparkLifeVariation; star.sparkColor = this.glitterColor; star.sparkTimer = Math.random() * star.sparkFreq; }
		};

		if (typeof this.color === "string") {
			if (this.color === "random") color = null; else color = this.color;
			createBurst(this.starCount, starFactory);
		} else if (Array.isArray(this.color)) {
			if (Math.random() < 0.5) {
				const start = Math.random() * Math.PI; const start2 = start + Math.PI; const arc = Math.PI;
				this.color = this.color[0]; createBurst(this.starCount, starFactory, start, arc);
				this.color = this.color[1]; createBurst(this.starCount, starFactory, start2, arc);
			} else {
				this.color = this.color[0]; createBurst(this.starCount / 2, starFactory);
				this.color = this.color[1]; createBurst(this.starCount / 2, starFactory);
			}
		}
		BurstFlash.add(x, y, this.spreadSize / 4);
		if (this.comet) soundManager.playSound("burst");
	}
}

const BurstFlash = {
	active: [], _pool: [], _new() { return {}; },
	add(x, y, radius) {
		const instance = this._pool.pop() || this._new();
		instance.x = x; instance.y = y; instance.radius = radius;
		this.active.push(instance); return instance;
	},
	returnInstance(instance) { this._pool.push(instance); },
};

function createParticleCollection() {
	const collection = {};
	COLOR_CODES_W_INVIS.forEach((color) => { collection[color] = []; });
	return collection;
}

const Star = {
	airDrag: 0.98, airDragHeavy: 0.992, active: createParticleCollection(), _pool: [],
	_new() { return {}; },
	add(x, y, color, angle, speed, life, speedOffX, speedOffY, size = 3) {
		const instance = this._pool.pop() || this._new();
		instance.visible = true; instance.heavy = false;
		instance.x = x; instance.y = y; instance.prevX = x; instance.prevY = y;
		instance.color = color; instance.speedX = Math.sin(angle) * speed + (speedOffX || 0); instance.speedY = Math.cos(angle) * speed + (speedOffY || 0);
		instance.life = life; instance.fullLife = life; instance.size = size;
		instance.spinAngle = Math.random() * PI_2; instance.spinSpeed = 0.8; instance.spinRadius = 0;
		instance.sparkFreq = 0; instance.sparkSpeed = 1; instance.sparkTimer = 0; instance.sparkColor = color; instance.sparkLife = 750; instance.sparkLifeVariation = 0.25;
		this.active[color].push(instance);
		return instance;
	},
	returnInstance(instance) { instance.onDeath && instance.onDeath(instance); instance.onDeath = null; this._pool.push(instance); },
};

const Spark = {
	drawWidth: 0, airDrag: 0.9, active: createParticleCollection(), _pool: [],
	_new() { return {}; },
	add(x, y, color, angle, speed, life) {
		const instance = this._pool.pop() || this._new();
		instance.x = x; instance.y = y; instance.prevX = x; instance.prevY = y;
		instance.color = color; instance.speedX = Math.sin(angle) * speed; instance.speedY = Math.cos(angle) * speed;
		instance.life = life;
		this.active[color].push(instance);
		return instance;
	},
	returnInstance(instance) { this._pool.push(instance); },
};

function createBurst(count, particleFactory, startAngle = 0, arcLength = PI_2) {
	const R = 0.5 * Math.sqrt(count / Math.PI); const C = 2 * R * Math.PI; const C_HALF = C / 2;
	for (let i = 0; i <= C_HALF; i++) {
		const ringAngle = (i / C_HALF) * PI_HALF; const ringSize = Math.cos(ringAngle);
		const partsPerFullRing = C * ringSize; const partsPerArc = partsPerFullRing * (arcLength / PI_2);
		const angleInc = PI_2 / partsPerFullRing; const angleOffset = Math.random() * angleInc + startAngle;
		const maxRandomAngleOffset = angleInc * 0.33;
		for (let i = 0; i < partsPerArc; i++) {
			const randomAngleOffset = Math.random() * maxRandomAngleOffset;
			let angle = angleInc * i + angleOffset + randomAngleOffset;
			particleFactory(angle, ringSize);
		}
	}
}

// --- HÀM TẠO CHỮ TỪ HẠT (ĐÃ THÊM MỚI) ---
function createWordBurst(wordText, x, y, colorStr) {
    // Gọi MyMath để lấy tọa độ điểm
    // Font size to cho rõ
	var map = MyMath.literalLattice(wordText, 4, "Arial", "120px");
	if (!map) return;
	var dcenterX = map.width / 2;
	var dcenterY = map.height / 2;

    const dotStarFactory = (point, color) => {
        // Tạo hạt nổ tĩnh (Spark)
        Spark.add(point.x, point.y, color, Math.random() * 2 * Math.PI, 0.3, 1800);
    };

	for (let i = 0; i < map.points.length; i++) {
		const point = map.points[i];
		let pX = x + (point.x - dcenterX);
		let pY = y + (point.y - dcenterY);
		dotStarFactory({ x: pX, y: pY }, colorStr);
	}
}

// --- MAIN UPDATE LOOP ---
function update(frameTime, lag) {
	if (!isRunning()) return;
	const width = stageW; const height = stageH;
	const timeStep = frameTime * simSpeed; const speed = simSpeed * lag;
	const starDrag = 1 - (1 - Star.airDrag) * speed; const sparkDrag = 1 - (1 - Spark.airDrag) * speed; const gAcc = (timeStep / 1000) * GRAVITY;

	COLOR_CODES_W_INVIS.forEach((color) => {
		const stars = Star.active[color];
		for (let i = stars.length - 1; i >= 0; i--) {
			const star = stars[i]; star.life -= timeStep;
			if (star.life <= 0) { stars.splice(i, 1); Star.returnInstance(star); } else {
				star.prevX = star.x; star.prevY = star.y; star.x += star.speedX * speed; star.y += star.speedY * speed;
				star.speedX *= starDrag; star.speedY *= starDrag; star.speedY += gAcc;
				if (star.sparkFreq) {
					star.sparkTimer -= timeStep;
					while (star.sparkTimer < 0) {
						star.sparkTimer += star.sparkFreq;
						Spark.add(star.x, star.y, star.sparkColor, Math.random() * PI_2, Math.random() * star.sparkSpeed, star.sparkLife);
					}
				}
			}
		}
		const sparks = Spark.active[color];
		for (let i = sparks.length - 1; i >= 0; i--) {
			const spark = sparks[i]; spark.life -= timeStep;
			if (spark.life <= 0) { sparks.splice(i, 1); Spark.returnInstance(spark); } else {
				spark.prevX = spark.x; spark.prevY = spark.y;
				spark.x += spark.speedX * speed; spark.y += spark.speedY * speed;
				spark.speedX *= sparkDrag; spark.speedY *= sparkDrag; spark.speedY += gAcc;
			}
		}
	});
	render(speed);
}

function render(speed) {
	const { dpr } = mainStage; const width = stageW; const height = stageH;
	const trailsCtx = trailsStage.ctx; const mainCtx = mainStage.ctx;
	trailsCtx.scale(dpr, dpr); mainCtx.scale(dpr, dpr);
	trailsCtx.globalCompositeOperation = "source-over";
	trailsCtx.fillStyle = `rgba(0, 0, 0, ${store.state.config.longExposure ? 0.0025 : 0.175 * speed})`;
	trailsCtx.fillRect(0, 0, width, height);
	mainCtx.clearRect(0, 0, width, height);
    
    // Lighten blend mode để pháo hoa sáng rực
    trailsCtx.globalCompositeOperation = "lighten"; 

	COLOR_CODES.forEach((color) => {
		const stars = Star.active[color];
		trailsCtx.strokeStyle = color; trailsCtx.beginPath();
		stars.forEach((star) => { if (star.visible) { trailsCtx.moveTo(star.x, star.y); trailsCtx.lineTo(star.prevX, star.prevY); mainCtx.moveTo(star.x, star.y); mainCtx.lineTo(star.x - star.speedX * 1.6, star.y - star.speedY * 1.6); } });
		trailsCtx.stroke();
		const sparks = Spark.active[color];
		trailsCtx.strokeStyle = color; trailsCtx.beginPath();
		sparks.forEach((spark) => { trailsCtx.moveTo(spark.x, spark.y); trailsCtx.lineTo(spark.prevX, spark.prevY); });
		trailsCtx.stroke();
	});
	while (BurstFlash.active.length) {
		const bf = BurstFlash.active.pop();
		const burstGradient = trailsCtx.createRadialGradient(bf.x, bf.y, 0, bf.x, bf.y, bf.radius);
		burstGradient.addColorStop(0, "rgba(255, 255, 255, 1)"); burstGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
		trailsCtx.fillStyle = burstGradient; trailsCtx.fillRect(bf.x - bf.radius, bf.y - bf.radius, bf.radius * 2, bf.radius * 2);
		BurstFlash.returnInstance(bf);
	}
	trailsCtx.setTransform(1, 0, 0, 1, 0, 0); mainCtx.setTransform(1, 0, 0, 1, 0, 0);
}

mainStage.addEventListener("ticker", update);

function handleResize() {
	const w = window.innerWidth; const h = window.innerHeight;
	const containerW = Math.min(w, MAX_WIDTH); const containerH = w <= 420 ? h : Math.min(h, MAX_HEIGHT);
	stages.forEach((stage) => stage.resize(containerW, containerH));
	const scaleFactor = parseFloat(store.state.config.scaleFactor);
	stageW = containerW / scaleFactor;
	stageH = containerH / scaleFactor;
}
handleResize();
window.addEventListener("resize", handleResize);

// --- KỊCH BẢN ĐẾM NGƯỢC (TỰ ĐỘNG CHẠY KHI BẤM NÚT) ---
function launchRandomShell() {
    const shell = new Shell(crysanthemumShell(Math.random() > 0.5 ? 2 : 3));
    shell.launch(Math.random(), 1);
}

window.startMyCountdown = function() {
    let count = 5;
    
    const interval = setInterval(() => {
        // Hiện số 5,4,3,2,1
        createWordBurst(count.toString(), stageW/2, stageH/2, COLOR.White);
        
        // Bắn vài quả phụ họa
        launchRandomShell();

        count--;
        if (count < 0) {
            clearInterval(interval);
            setTimeout(() => {
                // Hiện HAPPY NEW YEAR
                createWordBurst("HAPPY", stageW/2, stageH/2 - 100, COLOR.Gold);
                createWordBurst("NEW YEAR", stageW/2, stageH/2 + 50, COLOR.Gold);
                
                // Bắn pháo ăn mừng
                let finale = 0;
                const finInt = setInterval(() => {
                    launchRandomShell();
                    finale++;
                    if(finale > 10) clearInterval(finInt);
                }, 200);

                // Sau 3s hiện 2026
                setTimeout(() => {
                    createWordBurst("2026", stageW/2, stageH/2, COLOR.Red);
                    setTimeout(() => createWordBurst("2026", stageW/2, stageH/2, COLOR.Gold), 200);
                }, 3500);

            }, 1000);
        }
    }, 1000);
}

// Bắt đầu
init();