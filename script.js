"use strict";

// --- CẤU HÌNH HỆ THỐNG ---
const IS_MOBILE = window.innerWidth <= 640;
const GRAVITY = 0.9;
let simSpeed = 1;
let stageW, stageH;
let quality = 2;

// BẢNG MÀU RỰC RỠ (DÙNG ĐỂ VẼ CHỮ LOANG MÀU)
const COLOR = {
    Red: "#ff0043", Green: "#14fc56", Blue: "#1e7fff", Purple: "#e60aff", 
    Gold: "#ffbf36", White: "#ffffff", Cyan: "#00ffff", Magenta: "#ff00ff", 
    Lime: "#ccff00", Orange: "#ff9900", Pink: "#ff00cc"
};
const INVISIBLE = "_INVISIBLE_";
const PI_2 = Math.PI * 2;

// Khởi tạo Canvas
const trailsStage = new Stage("trails-canvas");
const mainStage = new Stage("main-canvas");
const stages = [trailsStage, mainStage];

// --- QUẢN LÝ ÂM THANH (CHẾ ĐỘ AN TOÀN - KHÔNG TREO MÁY) ---
const soundManager = {
    baseURL: "", 
    ctx: new (window.AudioContext || window.webkitAudioContext)(),
    sources: {
        lift: { volume: 1, playbackRateMin: 0.85, playbackRateMax: 0.95, fileNames: ["lift1.mp3", "lift2.mp3", "lift3.mp3"] },
        burst: { volume: 1, playbackRateMin: 0.8, playbackRateMax: 0.9, fileNames: ["burst1.mp3", "burst2.mp3"] },
        burstSmall: { volume: 0.25, playbackRateMin: 0.8, playbackRateMax: 1, fileNames: ["burst-sm-1.mp3", "burst-sm-2.mp3"] },
        crackle: { volume: 0.2, playbackRateMin: 1, playbackRateMax: 1, fileNames: ["crackle1.mp3"] },
        crackleSmall: { volume: 0.3, playbackRateMin: 1, playbackRateMax: 1, fileNames: ["crackle-sm-1.mp3"] }
    },
    buffers: {},
    preload() {
        // Tải nhạc nhưng KHÔNG return Promise chặn luồng
        Object.keys(this.sources).forEach(key => {
            const source = this.sources[key];
            source.fileNames.forEach(fileName => {
                fetch(fileName)
                    .then(res => {
                        if (res.ok) return res.arrayBuffer();
                    })
                    .then(data => {
                        if(data) this.ctx.decodeAudioData(data, buffer => {
                            if (!this.buffers[key]) this.buffers[key] = [];
                            this.buffers[key].push(buffer);
                        });
                    })
                    .catch(e => { /* Kệ lỗi nhạc, hình vẫn phải chạy */ });
            });
        });
    },
    playSound(type, scale = 1) {
        // Có nhạc thì phát, không có thì thôi
        if (!this.buffers[type] || this.buffers[type].length === 0) return;
        try {
            const sourceCfg = this.sources[type];
            const buffer = this.buffers[type][Math.floor(Math.random() * this.buffers[type].length)];
            const gainNode = this.ctx.createGain();
            gainNode.gain.value = (sourceCfg.volume || 1) * scale;
            const src = this.ctx.createBufferSource();
            src.buffer = buffer;
            src.playbackRate.value = 0.8 + Math.random() * 0.4;
            src.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            src.start(0);
        } catch(e) {}
    },
    resume() { if(this.ctx.state === 'suspended') this.ctx.resume(); }
};

// --- LOGIC HẠT (VISUAL) ---
const COLOR_CODES = Object.values(COLOR);
function randomColor() { return COLOR_CODES[Math.floor(Math.random() * COLOR_CODES.length)]; }

const Star = {
    active: {}, _pool: [], _new() { return {}; },
    add(x, y, color, angle, speed, life) {
        const instance = this._pool.pop() || this._new();
        instance.x = x; instance.y = y; instance.prevX = x; instance.prevY = y;
        instance.color = color; instance.speedX = Math.sin(angle) * speed; instance.speedY = Math.cos(angle) * speed;
        instance.life = life; instance.fullLife = life; 
        instance.spinAngle = Math.random() * PI_2; instance.spinSpeed = 0.8; 
        if(!this.active[color]) this.active[color] = [];
        this.active[color].push(instance);
        return instance;
    },
    returnInstance(instance) { instance.onDeath && instance.onDeath(instance); instance.onDeath = null; this._pool.push(instance); }
};

const Spark = {
    active: {}, _pool: [], _new() { return {}; },
    add(x, y, color, angle, speed, life) {
        const instance = this._pool.pop() || this._new();
        instance.x = x; instance.y = y; instance.prevX = x; instance.prevY = y;
        instance.color = color; instance.speedX = Math.sin(angle) * speed; instance.speedY = Math.cos(angle) * speed;
        instance.life = life;
        if(!this.active[color]) this.active[color] = [];
        this.active[color].push(instance);
        return instance;
    },
    returnInstance(instance) { this._pool.push(instance); }
};

// --- PHÁO HOA (SHELL) ---
class Shell {
    constructor(options) {
        Object.assign(this, options);
        this.color = options.color || randomColor();
        if (!this.starCount) this.starCount = 100;
    }
    launch(position, launchHeight) {
        const width = stageW; const height = stageH;
        const hpad = 60;
        const launchX = position * (width - hpad * 2) + hpad; 
        const launchY = height;
        const burstY = height - (height * launchHeight);
        const launchDistance = launchY - burstY;
        const launchVelocity = Math.pow(launchDistance * 0.04, 0.64);

        const comet = (this.comet = Star.add(
            launchX, launchY,
            typeof this.color === "string" && this.color !== "random" ? this.color : COLOR.White,
            Math.PI,
            launchVelocity * (this.horsetail ? 1.2 : 1),
            launchVelocity * (this.horsetail ? 100 : 400)
        ));
        
        comet.heavy = true; comet.spinRadius = 0.5;
        comet.onDeath = (c) => this.burst(c.x, c.y);
        soundManager.playSound("lift");
    }
    burst(x, y) {
        const speed = this.spreadSize / 96;
        const starFactory = (angle) => {
            const star = Star.add(x, y, this.color, angle, speed, this.starLife);
            if(this.glitter === 'light') {
                star.onDeath = (s) => { if(Math.random() < 0.2) soundManager.playSound("crackleSmall"); }
            }
        };
        const count = this.starCount;
        for(let i=0; i<count; i++) {
            const angle = (i/count) * PI_2;
            starFactory(angle);
        }
        if(this.shellSize < 2) soundManager.playSound("burstSmall");
        else soundManager.playSound("burst");
    }
}

// --- VÒNG LẶP CHÍNH ---
function update(frameTime, lag) {
    const speed = simSpeed * lag;
    const timeStep = frameTime * speed;
    const drag = 1 - (1 - 0.98) * speed; 
    const grav = (timeStep / 1000) * GRAVITY;

    [Star, Spark].forEach(Type => {
        Object.keys(Type.active).forEach(color => {
            const particles = Type.active[color];
            for(let i=particles.length-1; i>=0; i--) {
                const p = particles[i]; p.life -= timeStep;
                if(p.life <= 0) { particles.splice(i, 1); Type.returnInstance(p); continue; }
                p.prevX = p.x; p.prevY = p.y;
                p.x += p.speedX * speed; p.y += p.speedY * speed;
                p.speedX *= (Type === Spark ? 0.9 : drag); 
                p.speedY *= (Type === Spark ? 0.9 : drag); 
                p.speedY += (Type === Star ? grav : 0);
            }
        });
    });

    render(speed);
}

function render(speed) {
    const ctx = mainStage.ctx;
    const width = stageW; const height = stageH;
    
    // Đuôi mờ
    const trailsCtx = trailsStage.ctx;
    trailsCtx.globalCompositeOperation = "source-over";
    trailsCtx.fillStyle = `rgba(0, 0, 0, 0.2)`;
    trailsCtx.fillRect(0, 0, width, height);
    ctx.clearRect(0, 0, width, height);
    
    // Sáng rực
    trailsCtx.globalCompositeOperation = "lighten";
    trailsCtx.lineWidth = 3;

    Object.keys(Star.active).forEach(color => {
        const stars = Star.active[color];
        trailsCtx.strokeStyle = color; trailsCtx.beginPath();
        stars.forEach(star => { trailsCtx.moveTo(star.x, star.y); trailsCtx.lineTo(star.prevX, star.prevY); });
        trailsCtx.stroke();
    });
    
    // Vẽ chữ (Spark)
    trailsCtx.lineWidth = 2.5; // Chữ đậm hơn
    Object.keys(Spark.active).forEach(color => {
        const sparks = Spark.active[color];
        trailsCtx.strokeStyle = color; trailsCtx.beginPath();
        sparks.forEach(spark => { trailsCtx.moveTo(spark.x, spark.y); ctx.lineTo(spark.prevX, spark.prevY); });
        trailsCtx.stroke();
    });
}

mainStage.addEventListener("ticker", update);
function handleResize() { 
    stageW = window.innerWidth; stageH = window.innerHeight; 
    stages.forEach(s => s.resize(stageW, stageH)); 
}
handleResize(); window.addEventListener("resize", handleResize);

// =================================================================
// 4. KỊCH BẢN: CHỮ MÀU LOANG & ĐẾM NGƯỢC
// =================================================================

function createWordBurst(wordText, x, y, scale = 1) {
    // Font đậm để nhiều hạt màu
    const fontSize = Math.floor(110 * scale) + "px";
    var map = MyMath.literalLattice(wordText, 4, "Arial Black, Arial", fontSize); 
    if (!map) return;
    
    var dcenterX = map.width / 2;
    var dcenterY = map.height / 2;

    const dotStarFactory = (point) => {
        // !!! MỖI HẠT MỘT MÀU NGẪU NHIÊN ĐỂ TẠO HIỆU ỨNG LOANG !!!
        const color = COLOR_CODES[Math.floor(Math.random() * COLOR_CODES.length)];
        Spark.add(
            point.x, point.y, color, 
            Math.random() * 2 * Math.PI, 
            0.1, // Nổ rất chậm để giữ hình dáng chữ
            2500 // Sống 2.5s
        );
    };

    for (let i = 0; i < map.points.length; i++) {
        const point = map.points[i];
        dotStarFactory({ x: x + (point.x - dcenterX), y: y + (point.y - dcenterY) });
    }
    
    soundManager.playSound("burst");
    soundManager.playSound("crackle");
}

function launchShell(size = 1) {
    const shell = new Shell({
        shellSize: size, spreadSize: 300 + size * 100, starLife: 900 + size * 200, 
        color: randomColor(), glitter: "light", glitterColor: COLOR.Gold 
    });
    shell.launch(Math.random(), 1);
}

// HÀM CHẠY KỊCH BẢN (GỌI TỪ INDEX.HTML)
window.startMyCountdown = function() {
    // Bắt đầu tải nhạc ngay khi bấm nút (để trình duyệt cho phép)
    soundManager.resume();
    
    let count = 5;
    const interval = setInterval(() => {
        // Đếm ngược 5, 4, 3, 2, 1
        createWordBurst(count.toString(), stageW/2, stageH/2, 1.5);
        launchShell(2); 

        count--;
        if (count < 0) {
            clearInterval(interval);
            setTimeout(() => {
                // HAPPY NEW YEAR (Trên/Dưới)
                createWordBurst("HAPPY", stageW/2, stageH/2 - 120, 0.8);
                createWordBurst("NEW YEAR", stageW/2, stageH/2 + 30, 0.8);
                
                // Bắn liên thanh
                let finale = 0;
                const fin = setInterval(() => {
                    launchShell(Math.random()*2 + 2);
                    finale++;
                    if(finale > 15) clearInterval(fin);
                }, 200);

                // HIỆN 2026 SAU 3.5 GIÂY
                setTimeout(() => {
                    createWordBurst("2026", stageW/2, stageH/2, 1.8);
                    // Bồi thêm lớp nữa cho sáng rực
                    setTimeout(() => createWordBurst("2026", stageW/2, stageH/2, 1.8), 200);
                }, 3500);

            }, 1000);
        }
    }, 1000);
};

// === KHỞI ĐỘNG NGAY LẬP TỨC ===
// Không chờ tải ảnh/nhạc gì cả, vào là chạy loop ngay
soundManager.preload(); 
const loading = document.getElementById("start-overlay"); 
if(!loading) { // Nếu không có nút bấm (debug) thì chạy luôn
    togglePause(false); 
    configDidUpdate();
} else {
    // Nếu có nút bấm, chỉ cần init các thông số
    togglePause(false);
    configDidUpdate();
}