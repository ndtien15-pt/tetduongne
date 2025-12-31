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
	Red: "#ff0043",
	Green: "#14fc56",
	Blue: "#1e7fff",
	Purple: "#e60aff",
	Gold: "#ffbf36",
	White: "#ffffff",
};

const INVISIBLE = "_INVISIBLE_";
const PI_2 = Math.PI * 2;
const PI_HALF = Math.PI * 0.5;

const trailsStage = new Stage("trails-canvas");
const mainStage = new Stage("main-canvas");
const stages = [trailsStage, mainStage];

// --- CẤU HÌNH STORE ---
const store = {
	state: {
		paused: false,
		soundEnabled: true,
		menuOpen: false,
		config: {
			quality: String(IS_HIGH_END_DEVICE ? QUALITY_HIGH : QUALITY_NORMAL),
			shell: "Random",
			size: IS_DESKTOP ? "3" : "2",
			wordShell: true, 
			autoLaunch: false, // TẮT TỰ ĐỘNG ĐỂ CHẠY THEO KỊCH BẢN
			finale: false,
			skyLighting: SKY_LIGHT_NORMAL + "",
			hideControls: true,
			longExposure: false,
			scaleFactor: getDefaultScaleFactor(),
		},
	},
	setState(nextState) {
		this.state = Object.assign({}, this.state, nextState);
		configDidUpdate();
	},
	subscribe(listener) {} // Dummy
};

function configDidUpdate() {
	const config = store.state.config;
	quality = +config.quality;
	isLowQuality = quality === QUALITY_LOW;
	isNormalQuality = quality === QUALITY_NORMAL;
	isHighQuality = quality === QUALITY_HIGH;
	Spark.drawWidth = quality === QUALITY_HIGH ? 0.75 : 1;
}

// --- SOUND MANAGER (Đơn giản hóa để tránh lỗi nếu thiếu file) ---
const soundManager = {
	ctx: new (window.AudioContext || window.webkitAudioContext)(),
	playSound(type, scale = 1) {
        // Nếu ông có file âm thanh gốc thì uncomment đoạn dưới, không thì thôi để tránh lỗi
        /* // Code gốc loading âm thanh phức tạp, tôi bỏ qua để tránh crash nếu thiếu file
        */
	},
    resumeAll() {
        if(this.ctx.state === 'suspended') this.ctx.resume();
    }
};

// --- INIT ---
function init() {
	const container = document.querySelector(".canvas-container");
    // handleResize();
    togglePause(false);
	renderApp(store.state);
	configDidUpdate();
}

function togglePause(toggle) {
	store.state.paused = !toggle;
}

function renderApp(state) {} // Dummy

// --- HELPERS ---
const COLOR_CODES = Object.keys(COLOR).map((colorName) => COLOR[colorName]);
const COLOR_CODES_W_INVIS = [...COLOR_CODES, INVISIBLE];
const COLOR_TUPLES = {};
COLOR_CODES.forEach((hex) => {
	COLOR_TUPLES[hex] = {
		r: parseInt(hex.substr(1, 2), 16),
		g: parseInt(hex.substr(3, 2), 16),
		b: parseInt(hex.substr(5, 2), 16),
	};
});

function randomColorSimple() {
	return COLOR_CODES[(Math.random() * COLOR_CODES.length) | 0];
}

function randomColor(options) {
	return randomColorSimple();
}

// --- LỚP SHELL (VỎ PHÁO) ---
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
		const width = stageW;
		const height = stageH;
		const hpad = 60;
		const vpad = 50;
		const minHeightPercent = 0.45;
		const minHeight = height - height * minHeightPercent;
		const launchX = position * (width - hpad * 2) + hpad;
		const launchY = height;
		const burstY = minHeight - launchHeight * (minHeight - vpad);
		const launchDistance = launchY - burstY;
		const launchVelocity = Math.pow(launchDistance * 0.04, 0.64);
		const comet = (this.comet = Star.add(
			launchX,
			launchY,
			typeof this.color === "string" && this.color !== "random" ? this.color : COLOR.White,
			Math.PI,
			launchVelocity * (this.horsetail ? 1.2 : 1),
			launchVelocity * (this.horsetail ? 100 : 400)
		));
		comet.heavy = true;
		comet.spinRadius = 0.5; // MyMath.random(0.32, 0.85);
		comet.sparkFreq = 32 / quality;
		if (isHighQuality) comet.sparkFreq = 8;
		comet.sparkLife = 320;
		comet.sparkLifeVariation = 3;
		if (this.color === INVISIBLE) comet.sparkColor = COLOR.Gold;
		comet.onDeath = (comet) => this.burst(comet.x, comet.y);
	}
	burst(x, y) {
		const speed = this.spreadSize / 96;
		let color, onDeath, sparkFreq, sparkSpeed, sparkLife;
		let sparkLifeVariation = 0.25;
        
		if (this.glitter === "light") {
			sparkFreq = 400; sparkSpeed = 0.3; sparkLife = 300; sparkLifeVariation = 2;
		} else if (this.glitter === "heavy") {
			sparkFreq = 80; sparkSpeed = 0.8; sparkLife = 1400; sparkLifeVariation = 2;
		}
		sparkFreq = sparkFreq / quality;

		const starFactory = (angle, speedMult) => {
			const star = Star.add(
				x, y,
				this.color === "random" ? randomColor() : this.color,
				angle,
				speedMult * speed,
				this.starLife + Math.random() * this.starLife * this.starLifeVariation,
				0, 0
			);
			if (this.glitter) {
				star.sparkFreq = sparkFreq; star.sparkSpeed = sparkSpeed; star.sparkLife = sparkLife;
				star.sparkLifeVariation = sparkLifeVariation; star.sparkColor = this.glitterColor;
				star.sparkTimer = Math.random() * star.sparkFreq;
			}
		};

		createBurst(this.starCount, starFactory);
		BurstFlash.add(x, y, this.spreadSize / 4);
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
	returnInstance(instance) {
		instance.onDeath && instance.onDeath(instance);
		instance.onDeath = null; this._pool.push(instance);
	},
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
	const R = 0.5 * Math.sqrt(count / Math.PI);
	const C = 2 * R * Math.PI;
	const C_HALF = C / 2;
	for (let i = 0; i <= C_HALF; i++) {
		const ringAngle = (i / C_HALF) * PI_HALF;
		const ringSize = Math.cos(ringAngle);
		const partsPerFullRing = C * ringSize;
		const partsPerArc = partsPerFullRing * (arcLength / PI_2);
		const angleInc = PI_2 / partsPerFullRing;
		const angleOffset = Math.random() * angleInc + startAngle;
		const maxRandomAngleOffset = angleInc * 0.33;
		for (let i = 0; i < partsPerArc; i++) {
			const randomAngleOffset = Math.random() * maxRandomAngleOffset;
			let angle = angleInc * i + angleOffset + randomAngleOffset;
			particleFactory(angle, ringSize);
		}
	}
}

// --- HÀM TẠO CHỮ (ĐƯỢC SỬA ĐỂ GỌI TRỰC TIẾP) ---
function createWordBurst(wordText, x, y, colorStr) {
	var map = MyMath.literalLattice(wordText, 3, "Arial", "100px"); // Font chữ to
	if (!map) return;
	var dcenterX = map.width / 2;
	var dcenterY = map.height / 2;

    const dotStarFactory = (point, color) => {
        // Tạo hạt nổ tĩnh (Spark) giữ vị trí lâu hơn
        Spark.add(
            point.x, point.y, color, 
            Math.random() * 2 * Math.PI, 
            Math.pow(Math.random(), 0.3) * 0.3, // Tốc độ nổ rất nhỏ để giữ hình
            1800 // Thời gian sống lâu (1.8s)
        );
    };

	for (let i = 0; i < map.points.length; i++) {
		const point = map.points[i];
		let pX = x + (point.x - dcenterX);
		let pY = y + (point.y - dcenterY);
		dotStarFactory({ x: pX, y: pY }, colorStr);
	}
}

// --- LOẠI PHÁO HOA CƠ BẢN ---
const crysanthemumShell = (size = 1) => {
	const glitter = Math.random() < 0.25;
	const color = Math.random() < 0.72 ? randomColor() : [randomColor(), randomColor()];
	return {
		shellSize: size, spreadSize: 300 + size * 100, starLife: 900 + size * 200,
		starDensity: glitter ? 1.1 : 1.25, color, glitter: glitter ? "light" : "",
		glitterColor: COLOR.Gold,
	};
};

function update(frameTime, lag) {
	if (store.state.paused) return;
	const width = stageW; const height = stageH;
	const timeStep = frameTime * simSpeed; const speed = simSpeed * lag;
    const gAcc = (timeStep / 1000) * GRAVITY;
    const starDrag = 1 - (1 - Star.airDrag) * speed;
    const sparkDrag = 1 - (1 - Spark.airDrag) * speed;

	COLOR_CODES_W_INVIS.forEach((color) => {
		const stars = Star.active[color];
		for (let i = stars.length - 1; i >= 0; i--) {
			const star = stars[i]; star.life -= timeStep;
			if (star.life <= 0) { stars.splice(i, 1); Star.returnInstance(star); } else {
				star.prevX = star.x; star.prevY = star.y;
				star.x += star.speedX * speed; star.y += star.speedY * speed;
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
    
    // VẼ SAO VÀ TIA LỬA (quan trọng: dùng lighten để sáng rực)
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
	stageW = containerW; stageH = containerH;
}
handleResize();
window.addEventListener("resize", handleResize);

// =========================================================================
// PHẦN KỊCH BẢN ĐẾM NGƯỢC (CUSTOM TIMELINE)
// =========================================================================

function launchShell() {
    const shell = new Shell(crysanthemumShell(Math.random() > 0.5 ? 2 : 3));
    shell.launch(Math.random() * 0.8 + 0.1, 1);
}

window.startCountdown = function() {
    let count = 5;
    
    // HÀM ĐẾM NGƯỢC
    const countdownInterval = setInterval(() => {
        // Hiện số (Dùng hạt nổ màu trắng)
        createWordBurst(count.toString(), stageW / 2, stageH / 2, COLOR.White);
        
        // Bắn vài quả pháo phụ họa
        launchShell();

        count--;
        
        if (count < 0) {
            clearInterval(countdownInterval);
            setTimeout(showHappyText, 1000);
        }
    }, 1000);
}

function showHappyText() {
    // Hiện HAPPY NEW YEAR (Màu Vàng)
    createWordBurst("HAPPY", stageW / 2, stageH / 2 - 100, COLOR.Gold);
    createWordBurst("NEW YEAR", stageW / 2, stageH / 2 + 50, COLOR.Gold);
    
    // Bắn pháo hoa liên tục trong 3 giây
    let finaleCount = 0;
    const finaleInterval = setInterval(() => {
        launchShell();
        finaleCount++;
        if (finaleCount > 10) clearInterval(finaleInterval);
    }, 300);

    setTimeout(show2026, 3500);
}

function show2026() {
    // Hiện 2026 (Màu Đỏ viền Vàng)
    createWordBurst("2026", stageW / 2, stageH / 2, COLOR.Red);
    setTimeout(() => {
        createWordBurst("2026", stageW / 2, stageH / 2, COLOR.Gold);
    }, 100);

    // Bắn pháo hoa nền liên tục
    setInterval(() => {
        if(Math.random() < 0.3) launchShell();
    }, 500);
}

// Khởi chạy
init();