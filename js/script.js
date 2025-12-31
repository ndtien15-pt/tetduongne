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

// BẢNG MÀU RỰC RỠ (Dùng để vẽ chữ)
const COLOR = {
	Red: "#ff0043", Green: "#14fc56", Blue: "#1e7fff", Purple: "#e60aff", Gold: "#ffbf36", White: "#ffffff",
    Cyan: "#00ffff", Magenta: "#ff00ff", Lime: "#ccff00", Orange: "#ff9900"
};

const INVISIBLE = "_INVISIBLE_";
const PI_2 = Math.PI * 2;
const PI_HALF = Math.PI * 0.5;

const trailsStage = new Stage("trails-canvas");
const mainStage = new Stage("main-canvas");
const stages = [trailsStage, mainStage];

// --- QUẢN LÝ ÂM THANH (SỬA ĐỂ NHẬN FILE NGAY TẠI GỐC) ---
const soundManager = {
	baseURL: "./", // Thư mục gốc
	ctx: new (window.AudioContext || window.webkitAudioContext)(),
	sources: {
		lift: { volume: 1, playbackRateMin: 0.85, playbackRateMax: 0.95, fileNames: ["lift1.mp3", "lift2.mp3", "lift3.mp3"] },
		burst: { volume: 1, playbackRateMin: 0.8, playbackRateMax: 0.9, fileNames: ["burst1.mp3", "burst2.mp3"] },
		burstSmall: { volume: 0.25, playbackRateMin: 0.8, playbackRateMax: 1, fileNames: ["burst-sm-1.mp3", "burst-sm-2.mp3"] },
		crackle: { volume: 0.2, playbackRateMin: 1, playbackRateMax: 1, fileNames: ["crackle1.mp3"] },
		crackleSmall: { volume: 0.3, playbackRateMin: 1, playbackRateMax: 1, fileNames: ["crackle-sm-1.mp3"] },
	},
	preload() { 
        const allPromises = [];
        Object.keys(this.sources).forEach(key => {
            const source = this.sources[key];
            const promises = source.fileNames.map(fileName => 
                fetch(this.baseURL + fileName)
                .then(res => {
                    if (!res.ok) throw new Error("File not found: " + fileName);
                    return res.arrayBuffer();
                })
                .then(data => this.ctx.decodeAudioData(data))
                .then(buffer => buffer)
                .catch(e => {
                    console.log("Không tải được nhạc:", fileName); 
                    return null;
                })
            );
            Promise.all(promises).then(buffers => source.buffers = buffers.filter(b => b));
        });
        return Promise.resolve(); // Trả về ngay để không chặn code
    },
	pauseAll() { if(this.ctx.state === 'running') this.ctx.suspend(); },
	resumeAll() { 
        if(this.ctx.state === 'suspended') this.ctx.resume(); 
        // Phát tiếng 'lift' nhẹ để kích hoạt audio trên mobile
        this.playSound('lift', 0);
    },
	playSound(type, scale = 1) {
		const source = this.sources[type];
		if (!source || !source.buffers || source.buffers.length === 0) return;
		const buffer = source.buffers[Math.floor(Math.random() * source.buffers.length)];
		const gainNode = this.ctx.createGain();
		gainNode.gain.value = source.volume * scale;
		const bufferSource = this.ctx.createBufferSource();
		bufferSource.playbackRate.value = Math.random() * (source.playbackRateMax - source.playbackRateMin) + source.playbackRateMin;
		bufferSource.buffer = buffer;
		bufferSource.connect(gainNode);
		gainNode.connect(this.ctx.destination);
		bufferSource.start(0);
	},
};

// --- STORE ---
const store = {
	state: {
		paused: true, soundEnabled: true,
		config: {
			quality: String(IS_HIGH_END_DEVICE ? QUALITY_HIGH : QUALITY_NORMAL),
			shell: "Random", size: IS_DESKTOP ? "3" : "2",
			autoLaunch: false, // TẮT TỰ ĐỘNG ĐỂ CHẠY KỊCH BẢN
			finale: false, skyLighting: SKY_LIGHT_NORMAL + "",
			hideControls: true, longExposure: false, scaleFactor: getDefaultScaleFactor(),
		},
	},
	setState(nextState) { this.state = Object.assign({}, this.state, nextState); configDidUpdate(); },
	subscribe(listener) {}
};

function configDidUpdate() {
	const config = store.state.config;
	quality = +config.quality;
	isLowQuality = quality === QUALITY_LOW;
	isNormalQuality = quality === QUALITY_NORMAL;
	isHighQuality = quality === QUALITY_HIGH;
	Spark.drawWidth = quality === QUALITY_HIGH ? 0.75 : 1;
}

// --- INIT ---
function init() {
    soundManager.preload();
    // Bỏ qua màn hình loading, chạy luôn
	togglePause(false);
	configDidUpdate();
}

function togglePause(toggle) {
	const paused = store.state.paused;
	let newValue = typeof toggle === "boolean" ? toggle : !paused;
	if (paused !== newValue) store.setState({ paused: newValue });
}

// --- HELPERS ---
const COLOR_CODES = Object.keys(COLOR).map(k => COLOR[k]);
const COLOR_CODES_W_INVIS = [...COLOR_CODES, INVISIBLE];

function randomColorSimple() { return COLOR_CODES[(Math.random() * COLOR_CODES.length) | 0]; }
function randomColor() { return randomColorSimple(); }
function whiteOrGold() { return Math.random() < 0.5 ? COLOR.Gold : COLOR.White; }

// --- HÀM TẠO CHỮ MÀU LOANG RỰC RỠ (ĐÃ SỬA) ---
function createWordBurst(wordText, x, y) {
    // Dùng font đậm để nhiều hạt hơn
	var map = MyMath.literalLattice(wordText, 4, "Arial Black, Arial", "120px"); 
	if (!map) return;
	var dcenterX = map.width / 2;
	var dcenterY = map.height / 2;

    const dotStarFactory = (point) => {
        // CHỌN MÀU NGẪU NHIÊN CHO TỪNG HẠT => TẠO HIỆU ỨNG LOANG MÀU
        const color = randomColorSimple();
        
        Spark.add(
            point.x, point.y, 
            color, 
            Math.random() * 2 * Math.PI, 
            0.15, // Tốc độ nổ rất nhỏ để giữ nét chữ
            2500  // Thời gian tồn tại lâu (2.5s)
        );
    };

	for (let i = 0; i < map.points.length; i++) {
		const point = map.points[i];
		dotStarFactory({ x: x + (point.x - dcenterX), y: y + (point.y - dcenterY) });
	}
    
    // Phát tiếng nổ khi hiện chữ
    soundManager.playSound("burst");
    soundManager.playSound("crackle");
}

// --- SHELL CLASS ---
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
		const hpad = 60; const vpad = 50; const minHeightPercent = 0.45;
		const minHeight = height - height * minHeightPercent;
		const launchX = position * (width - hpad * 2) + hpad; const launchY = height;
		const burstY = minHeight - launchHeight * (minHeight - vpad);
		const launchDistance = launchY - burstY;
		const launchVelocity = Math.pow(launchDistance * 0.04, 0.64);
		const comet = (this.comet = Star.add(
			launchX, launchY,
			typeof this.color === "string" && this.color !== "random" ? this.color : COLOR.White,
			Math.PI,
			launchVelocity * (this.horsetail ? 1.2 : 1),
			launchVelocity * (this.horsetail ? 100 : 400)
		));
		comet.heavy = true; comet.spinRadius = 0.5; comet.sparkFreq = 32 / quality;
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
        else if (this.glitter === "heavy") { sparkFreq = 80; sparkSpeed = 0.8; sparkLife = 1400; sparkLifeVariation = 2; }
		sparkFreq = sparkFreq / quality;

		const starFactory = (angle, speedMult) => {
			const star = Star.add(x, y, this.color || randomColor(), angle, speedMult * speed, this.starLife + Math.random() * this.starLife * this.starLifeVariation, 0, 0);
			if (this.glitter) {
				star.sparkFreq = sparkFreq; star.sparkSpeed = sparkSpeed; star.sparkLife = sparkLife;
				star.sparkLifeVariation = sparkLifeVariation; star.sparkColor = this.glitterColor;
				star.sparkTimer = Math.random() * star.sparkFreq;
			}
		};

        createBurst(this.starCount, starFactory);
		BurstFlash.add(x, y, this.spreadSize / 4);
		soundManager.playSound("burst");
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
		instance.color = color;
		instance.speedX = Math.sin(angle) * speed + (speedOffX || 0);
		instance.speedY = Math.cos(angle) * speed + (speedOffY || 0);
		instance.life = life; instance.fullLife = life; instance.size = size;
		instance.spinAngle = Math.random() * PI_2; instance.spinSpeed = 0.8; instance.spinRadius = 0;
		instance.sparkFreq = 0; instance.sparkSpeed = 1; instance.sparkTimer = 0;
		instance.sparkColor = color; instance.sparkLife = 750; instance.sparkLifeVariation = 0.25;
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
		instance.color = color;
		instance.speedX = Math.sin(angle) * speed; instance.speedY = Math.cos(angle) * speed;
		instance.life = life;
		this.active[color].push(instance);
		return instance;
	},
	returnInstance(instance) { this._pool.push(instance); },
};

function createBurst(count, particleFactory) {
    const R = 0.5 * Math.sqrt(count / Math.PI); const C = 2 * R * Math.PI; const C_HALF = C / 2;
    for (let i = 0; i <= C_HALF; i++) {
        const ringAngle = (i / C_HALF) * PI_HALF; const ringSize = Math.cos(ringAngle);
        const partsPerFullRing = C * ringSize; const partsPerArc = partsPerFullRing * PI_2;
        const angleInc = PI_2 / partsPerFullRing; const angleOffset = Math.random() * angleInc;
        for (let i = 0; i < partsPerArc; i++) {
            const angle = angleInc * i + angleOffset;
            particleFactory(angle, ringSize);
        }
    }
}

// --- UPDATE & RENDER ---
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
    
    // --- CHẾ ĐỘ SÁNG RỰC (LIGHTEN) ---
    trailsCtx.globalCompositeOperation = "lighten"; 

	COLOR_CODES.forEach((color) => {
		const stars = Star.active[color];
		trailsCtx.strokeStyle = color; trailsCtx.beginPath();
		stars.forEach((star) => { if (star.visible) { trailsCtx.moveTo(star.x, star.y); trailsCtx.lineTo(star.prevX, star.prevY); } });
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

// --- KỊCH BẢN CHÍNH ---
const crysanthemumShell = (size = 1) => ({
    shellSize: size, spreadSize: 300 + size * 100, starLife: 900 + size * 200, 
    starDensity: 1.2, color: randomColor(), glitter: "light", glitterColor: COLOR.Gold 
});

function launchShell(size = 1) {
    const shell = new Shell(crysanthemumShell(size));
    shell.launch(Math.random(), 1);
}

window.startMyCountdown = function() {
    let count = 5;
    
    const interval = setInterval(() => {
        // Hiện số đếm ngược (Màu loang sặc sỡ)
        createWordBurst(count.toString(), stageW/2, stageH/2);
        launchShell(2); // Bắn phụ họa

        count--;
        if (count < 0) {
            clearInterval(interval);
            setTimeout(() => {
                // HAPPY NEW YEAR (Vị trí trên dưới)
                createWordBurst("HAPPY", stageW/2, stageH/2 - 100);
                createWordBurst("NEW YEAR", stageW/2, stageH/2 + 50);
                
                // Bắn liên tục
                let finale = 0;
                const finInt = setInterval(() => {
                    launchShell(Math.random() * 2 + 2);
                    finale++;
                    if(finale > 10) clearInterval(finInt);
                }, 300);

                // Sau 3s hiện 2026 (Màu loang)
                setTimeout(() => {
                    createWordBurst("2026", stageW/2, stageH/2);
                    // Bắn quả pháo to kết thúc
                    const bigShell = new Shell(crysanthemumShell(3));
                    bigShell.launch(0.5, 1); 
                }, 3500);

            }, 1000);
        }
    }, 1000);
}

// Chạy luôn init
init();