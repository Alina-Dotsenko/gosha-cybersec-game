(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const btnStart = document.getElementById('btnStart');
  const btnRestart = document.getElementById('btnRestart');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnPause = document.getElementById('btnPause');
  const lbList = document.getElementById('leaderboard');

  const W = canvas.width;
  const H = canvas.height;

  // WebAudio simple sound engine
  let audioCtx = null;
  const ensureAudio = () => audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
  function beep(freq=440, duration=0.08, type='sine', gain=0.06){
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }
  const SFX = {
    order(){ ensureAudio(); beep(740,0.06,'square',0.08); beep(980,0.06,'square',0.05); },
    hit(){ ensureAudio(); beep(200,0.12,'sawtooth',0.1); },
    level(){ ensureAudio(); beep(660,0.08,'triangle',0.09); setTimeout(()=>beep(880,0.1,'triangle',0.09),80); },
    start(){ ensureAudio(); beep(520,0.08,'sine',0.06); },
    over(){ ensureAudio(); beep(300,0.18,'sawtooth',0.12); setTimeout(()=>beep(180,0.22,'sawtooth',0.1),160); },
  };

  // Leaderboard (localStorage)
  const LB_KEY = 'gosha-secure-lb';
  function loadLB(){
    try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch { return []; }
  }
  function saveLB(list){ localStorage.setItem(LB_KEY, JSON.stringify(list)); renderLB(); }
  function renderLB(){
    const list = loadLB().slice(0,10);
    lbList.innerHTML = list.map((r,i)=>`<li>${i+1}. ${r.name} — ${r.score}</li>`).join('') || '<li>Пока пусто. Сыграй первую партию!</li>';
  }
  function addToLB(name, score){
    const list = loadLB();
    list.push({name, score, ts: Date.now()});
    list.sort((a,b)=>b.score - a.score || a.ts - b.ts);
    saveLB(list.slice(0,10));
  }
  renderLB();

  // Game state
  let running = false;
  let score = 0;
  let lives = 3;
  let level = 1;
  let spawnTimer = 0;
  let spawnInterval = 900; // ms
  let speed = 140; // base fall speed
  let last = 0;
  let gameEnded = false;

  // Player (Goose Gosha)
  const player = {
    x: W/2, y: H-90, w: 80, h: 100, vx: 0, speed: 300, img: null
  };

  // Sprites
  const gooseImg = new Image(); gooseImg.src = 'assets/goose.png'; player.img = gooseImg;
  const imgBox = new Image(); imgBox.src = 'assets/box.png';
  const imgPhish = new Image(); imgPhish.src = 'assets/phish.png';
  const imgUsb = new Image(); imgUsb.src = 'assets/usb.png';
  const imgDdos = new Image(); imgDdos.src = 'assets/ddos.png';

  const keys = { left:false, right:false };

  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

  // Items
  const items = []; // each {x,y,w,h,type,vy}
  const TYPES = {
    ORDER: 'order',
    PHISH: 'phish',
    USB: 'usb',
    FLOOD: 'flood'
  };

  function spawnItem(){
    // Weighted spawn: 60% orders, 40% attacks
    const r = Math.random();
    let type;
    if (r < 0.6) type = TYPES.ORDER;
    else if (r < 0.8) type = TYPES.PHISH;
    else if (r < 0.9) type = TYPES.USB;
    else type = TYPES.FLOOD;

    const w = type === TYPES.FLOOD ? 64 : 56;
    const h = type === TYPES.FLOOD ? 40 : 56;
    const x = Math.random() * (W - w);
    const y = -h - 10;
    const vy = speed + Math.random()*speed*0.3 + (level-1)*25;
    items.push({x,y,w,h,type,vy});
  }

  function rectsIntersect(a,b){
    return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
  }

  function update(dt){
    // controls
    player.vx = 0;
    if (keys.left) player.vx -= player.speed;
    if (keys.right) player.vx += player.speed;
    player.x += player.vx * dt;
    player.x = clamp(player.x, 0, W - player.w);

    // spawn
    spawnTimer += dt*1000;
    if (spawnTimer >= spawnInterval){
      spawnTimer = 0;
      spawnItem();
    }

    // update items
    for (let i=items.length-1; i>=0; i--){
      const it = items[i];
      it.y += it.vy * dt;

      // collision
      if (rectsIntersect({x:player.x,y:player.y,w:player.w,h:player.h}, it)){
        if (it.type === TYPES.ORDER){
          score += 10;
          SFX.order();
          // level up
          if (score % 100 === 0){
            level++;
            levelEl.textContent = level;
            spawnInterval = Math.max(350, spawnInterval - 70);
            SFX.level();
          }
        }else{
          lives -= 1;
          SFX.hit();
          if (lives <= 0){
            lives = 0;
            gameOver();
          }
        }
        items.splice(i,1);
        continue;
      }

      // remove if off screen
      if (it.y > H + 60) items.splice(i,1);
    }
  }

  function drawPlayer(){
    const im = player.img;
    if (im && im.complete){
      ctx.drawImage(im, player.x, player.y, player.w, player.h);
    } else {
      ctx.fillStyle = '#3bbf6b';
      ctx.fillRect(player.x, player.y, player.w, player.h);
    }
  }

  function drawSprite(im, x,y,w,h){
    if (im && im.complete){
      const ar = im.width / im.height;
      let rw = w, rh = h;
      if (rw/rh > ar) rw = rh*ar; else rh = rw/ar;
      ctx.drawImage(im, x + (w-rw)/2, y + (h-rh)/2, rw, rh);
    } else {
      ctx.fillStyle = '#ccc'; ctx.fillRect(x,y,w,h);
    }
  }

  function drawItems(){
    for (const it of items){
      switch(it.type){
        case TYPES.ORDER: drawSprite(imgBox, it.x,it.y,it.w,it.h); break;
        case TYPES.PHISH: drawSprite(imgPhish, it.x,it.y,it.w,it.h); break;
        case TYPES.USB:   drawSprite(imgUsb, it.x,it.y,it.w,it.h); break;
        case TYPES.FLOOD: drawSprite(imgDdos, it.x,it.y,it.w,it.h); break;
      }
    }
  }

  function drawHud(){
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    levelEl.textContent = level;
  }

  function loop(ts){
    if (!running){ requestAnimationFrame(loop); return; }
    const dt = Math.min(0.033, (ts - (loop.last||ts))/1000);
    loop.last = ts;
    update(dt);
    ctx.clearRect(0,0,W,H);
    drawItems();
    drawPlayer();
    drawHud();
    requestAnimationFrame(loop);
  }

  function toggleRun(){
    running = !running;
    if (running){ loop.last = performance.now(); SFX.start(); }
  }

  function restart(){
    running = false;
    score = 0; lives = 3; level = 1;
    spawnTimer = 0; spawnInterval = 900; speed = 140;
    items.splice(0, items.length);
    player.x = W/2;
    gameEnded = false;
    drawHud();
  }

  function gameOver(){
    running = false;
    gameEnded = true;
    SFX.over();
    // overlay
    const W = canvas.width, H = canvas.height;
    const ctx2 = ctx;
    ctx2.save();
    ctx2.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2.fillRect(0,0,W,H);
    ctx2.fillStyle = '#fff';
    ctx2.font = '28px system-ui, Arial';
    ctx2.textAlign = 'center';
    ctx2.fillText('Игра окончена! Итог: ' + score, W/2, H/2 - 10);
    ctx2.font = '16px system-ui, Arial';
    ctx2.fillText('Введи имя для таблицы рекордов в появившемся окне.', W/2, H/2 + 20);
    ctx2.restore();
    setTimeout(() => {
      const name = (prompt('Твоё имя для таблицы рекордов?', 'Гость') || 'Гость').slice(0,20);
      addToLB(name, score);
    }, 50);
  }

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') { e.preventDefault(); toggleRun(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
  });

  // mouse
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * canvas.width;
    player.x = Math.max(0, Math.min(W - player.w, mx - player.w/2));
  });

  // touch/mobile
  if (btnLeft && btnRight && btnPause){
    const bindHold = (btn, key) => {
      const on = e => { e.preventDefault(); keys[key] = true; };
      const off = e => { e.preventDefault(); keys[key] = false; };
      btn.addEventListener('touchstart', on); btn.addEventListener('touchend', off);
      btn.addEventListener('mousedown', on); btn.addEventListener('mouseup', off); btn.addEventListener('mouseleave', off);
    };
    bindHold(btnLeft, 'left'); bindHold(btnRight, 'right');
    btnPause.addEventListener('click', toggleRun);
  }

  btnStart.addEventListener('click', () => { ensureAudio(); toggleRun(); });
  btnRestart.addEventListener('click', () => { restart(); });
  requestAnimationFrame(loop);
  toggleRun();
})();