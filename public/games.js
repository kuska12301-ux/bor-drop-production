(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const style = document.createElement('style');
  style.textContent = `
    .games{gap:14px}.game{overflow:hidden;isolation:isolate;box-shadow:0 14px 32px rgba(25,35,70,.12);transition:transform .22s ease,box-shadow .22s ease}.game:active{transform:scale(.97)}
    .game::after{content:"";position:absolute;inset:-60%;background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.55) 50%,transparent 62%);transform:translateX(-60%) rotate(10deg);animation:borShine 5.5s ease-in-out infinite;pointer-events:none}
    .game.arena::after{animation-delay:1.2s}.game.wide::after{animation-delay:2.4s}
    .bor-stage{position:relative;height:240px;margin:8px 0 16px;border-radius:26px;overflow:hidden;color:#fff;background:radial-gradient(circle at 50% 15%,#6b52ff 0,#25204f 44%,#12142a 100%);box-shadow:0 18px 44px rgba(30,25,80,.25);border:1px solid rgba(255,255,255,.12);isolation:isolate}
    .bor-stage::before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:24px 24px;mask-image:linear-gradient(#000,transparent)}
    .bor-stage-head{position:absolute;left:16px;right:16px;top:14px;z-index:5;display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#c9c5ff}
    .bor-live{display:flex;align-items:center;gap:6px}.bor-live i{width:7px;height:7px;border-radius:50%;background:#43ef9d;box-shadow:0 0 12px #43ef9d;animation:borPulse 1.2s infinite}
    .bor-bank{padding:7px 10px;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:rgba(10,12,30,.42);backdrop-filter:blur(10px);color:#fff;letter-spacing:0}.bor-bank b{color:#62e9ff}
    .bor-status{position:absolute;bottom:13px;left:16px;right:16px;text-align:center;font-size:12px;color:#b8bad0;z-index:5}.bor-status strong{color:#fff}
    .roulette-window{position:absolute;left:0;right:0;top:58px;height:132px;display:flex;align-items:center;overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}
    .roulette-window::after{content:"";position:absolute;left:50%;top:0;bottom:0;width:3px;transform:translateX(-50%);background:linear-gradient(transparent,#60edff 18%,#fff 50%,#60edff 82%,transparent);filter:drop-shadow(0 0 7px #60edff);z-index:4}
    .roulette-track{display:flex;gap:10px;padding-left:calc(50% - 45px);will-change:transform}.roulette-ticket{flex:0 0 90px;height:108px;border-radius:19px;display:grid;place-items:center;background:linear-gradient(150deg,rgba(255,255,255,.19),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.18);box-shadow:0 9px 22px rgba(0,0,0,.2)}
    .roulette-ticket span,.fighter-avatar{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;font-size:22px;font-weight:900;color:#1d1640;background:linear-gradient(135deg,#73f0ff,#c5a5ff)}.roulette-ticket small{margin-top:-15px;color:#dddaf8;font-weight:700;max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .arena-floor{position:absolute;left:0;right:0;top:52px;bottom:30px;display:flex;align-items:center;justify-content:space-around;perspective:700px}.fighter{width:104px;text-align:center;z-index:2;transition:filter .3s}.fighter-avatar{width:78px;height:78px;margin:auto;font-size:30px;border:4px solid rgba(255,255,255,.35);box-shadow:0 0 0 8px rgba(116,237,255,.08),0 15px 28px rgba(0,0,0,.27)}.fighter.right .fighter-avatar{background:linear-gradient(135deg,#ff75c5,#ffd66b)}.fighter b{display:block;margin-top:10px;font-size:13px}.fighter small{color:#aaa9c9}.arena-vs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-7deg);font-size:30px;font-style:italic;font-weight:1000;color:#fff;text-shadow:0 0 18px #8f6cff;z-index:3}.arena-beam{position:absolute;width:120px;height:3px;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;box-shadow:0 0 14px #9b82ff;opacity:.3}
    .wheel-wrap{position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);width:170px;height:170px}.prize-wheel{position:relative;width:100%;height:100%;border-radius:50%;background:conic-gradient(#ff7417 0 45deg,#6d2b9d 45deg 90deg,#1b1026 90deg 135deg,#b54b18 135deg 180deg,#ff7417 180deg 225deg,#6d2b9d 225deg 270deg,#1b1026 270deg 315deg,#b54b18 315deg);border:8px solid rgba(255,255,255,.18);box-shadow:0 0 0 3px rgba(255,255,255,.8),0 18px 38px #070819aa,inset 0 0 25px #15132b;will-change:transform}.wheel-person{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px;border-radius:50%;object-fit:cover;border:3px solid #fff;background:linear-gradient(135deg,#ff932e,#8c31ff);display:grid;place-items:center;font-weight:900;color:#fff;box-shadow:0 5px 13px #0008;transform:rotate(var(--angle)) translateY(-57px) rotate(calc(-1 * var(--angle)))}.wheel-hub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#342668;font-weight:1000;box-shadow:0 6px 18px #131326}.wheel-pointer{position:absolute;left:50%;top:-8px;transform:translateX(-50%);z-index:4;width:0;height:0;border-left:13px solid transparent;border-right:13px solid transparent;border-top:30px solid #fff;filter:drop-shadow(0 5px 5px #090b20)}
    .bor-confetti{position:fixed;top:-20px;left:0;width:9px;height:15px;border-radius:2px;z-index:9999;pointer-events:none;animation:borFall 1.8s ease-in forwards}
    .bor-stage.is-spinning .roulette-track{animation:borReel 3.2s cubic-bezier(.08,.72,.13,1) forwards}.bor-stage.is-fighting .fighter.left{animation:borFightL 1.6s ease-in-out 2}.bor-stage.is-fighting .fighter.right{animation:borFightR 1.6s ease-in-out 2}.bor-stage.is-fighting .arena-vs{animation:borImpact .8s ease-in-out 4}.bor-stage.is-fighting{animation:borShake .16s linear 14 1.7s}.bor-stage.is-wheel .prize-wheel{animation:borWheel 4s cubic-bezier(.08,.7,.08,1) forwards}
    .bor-stage.winner-flash{box-shadow:0 0 0 2px #70edff,0 22px 60px rgba(91,97,255,.55)}
    @keyframes borShine{0%,64%{transform:translateX(-65%) rotate(10deg)}85%,100%{transform:translateX(65%) rotate(10deg)}}@keyframes borPulse{50%{opacity:.35;transform:scale(.75)}}
    @keyframes borReel{0%{transform:translateX(0)}100%{transform:translateX(calc(-100% + 280px))}}@keyframes borFightL{0%,100%{transform:translateX(0) rotateY(0)}45%{transform:translateX(72px) scale(1.08) rotateY(15deg)}55%{transform:translateX(58px) scale(.95)}}@keyframes borFightR{0%,100%{transform:translateX(0) rotateY(0)}45%{transform:translateX(-72px) scale(1.08) rotateY(-15deg)}55%{transform:translateX(-58px) scale(.95)}}@keyframes borImpact{50%{transform:translate(-50%,-50%) rotate(8deg) scale(1.5);filter:brightness(2)}}@keyframes borShake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}@keyframes borWheel{to{transform:rotate(1815deg)}}
    @keyframes borFall{to{transform:translate(var(--drift),110vh) rotate(900deg);opacity:.2}}
    @media(max-width:380px){.bor-stage{height:222px}.fighter-avatar{width:66px;height:66px}.wheel-wrap{width:154px;height:154px}}
    @media(prefers-reduced-motion:reduce){.game::after,.bor-live i{animation:none!important}.bor-stage *{animation-duration:.01ms!important;animation-iteration-count:1!important}}
    :root{--h-orange:#ff7a00;--h-purple:#7a2cff;--h-ink:#120d1d}html,body{background:radial-gradient(circle at 18% 4%,#3f174f 0,transparent 28%),radial-gradient(circle at 85% 14%,#703315 0,transparent 25%),linear-gradient(160deg,#130d1e,#08070d 72%)!important;color:#fff!important;min-height:100%}body::before{content:"🎃";position:fixed;left:4vw;top:14vh;font-size:54px;filter:drop-shadow(0 0 18px #ff7900);opacity:.32;animation:hFloat 4s ease-in-out infinite;pointer-events:none}body::after{content:"👻";position:fixed;right:5vw;top:28vh;font-size:52px;opacity:.25;animation:hFloat 5s ease-in-out infinite reverse;pointer-events:none}header,.topbar,.card,.tabbar{background:rgba(27,20,38,.94)!important;border:1px solid rgba(255,133,36,.22)!important;box-shadow:0 18px 45px #0008!important}header .user small{color:#d7cbe2!important}header #balance{color:#fff!important;text-shadow:0 0 12px #ff7a0088}header .unit{color:#ff9b45!important}header .iconbutton{background:#2a2035!important;color:#fff!important;border-color:#5f426f!important}header .iconbutton.wager-active{position:relative;border-color:#ff7a00!important;box-shadow:0 0 16px #ff720055!important}header .iconbutton.wager-active::after{content:attr(data-wager-label);position:absolute;right:-4px;top:-9px;padding:2px 5px;border-radius:8px;background:#ff6b00;color:#fff;font-size:8px;font-weight:900;white-space:nowrap}.sectiontitle,h2,.smalltitle{color:#fff!important}.sub,small{color:#bfb4cc!important}.primary{background:linear-gradient(135deg,#ff7a00,#9a31ff)!important;color:white!important;box-shadow:0 9px 24px #ff720044}.game{border:1px solid #ff923666!important}.game:first-child{background:linear-gradient(145deg,#2c153d,#ff7200)!important}.game.arena{background:linear-gradient(145deg,#42124f,#8c2dff)!important}.game.wide{background:linear-gradient(110deg,#191025,#ff4d00 55%,#7727d9)!important}.bor-stage{background:radial-gradient(circle at 50% 18%,#8b3219 0,#2a1438 42%,#090810 100%)}.bor-stage::after{content:"🦇  ✦  🕸️";position:absolute;right:16px;top:42px;opacity:.4;letter-spacing:8px}.ticket,.roulette-ticket{border-color:#ff8a3866!important}.roulette-ticket span,.fighter-avatar{background:linear-gradient(135deg,#ff9d2e,#a855f7)!important}.payment-dialog{background:#1d1528!important;color:white!important;border:1px solid #ff852d66!important}.avatar{background:linear-gradient(135deg,#ff7a00,#7c2bff)!important}.h-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;background:linear-gradient(135deg,#ff932e,#8c31ff);display:grid;place-items:center;font-weight:900}.h-countdown{font-size:22px;color:#ff9c3d;text-shadow:0 0 14px #ff6800}.bonus-reel{position:relative;display:flex;gap:7px;overflow:hidden;margin:17px 0;padding:15px 7px;border-radius:18px;background:#100b18;border:1px solid #5f426f}.bonus-reel::after{content:"";position:absolute;left:50%;top:5px;bottom:5px;width:2px;background:#fff;box-shadow:0 0 9px #ff7a00}.bonus-reel .reward{flex:0 0 62px!important;margin:0!important;background:linear-gradient(145deg,#3c2649,#21162d)!important;border:1px solid #805593!important;color:#fff!important}.bonus-reel.spinning .reward{animation:bonusPulse .18s linear 10 alternate}.wager-note{display:flex;justify-content:space-between;align-items:center;margin:0 0 14px;padding:10px 12px;border-radius:13px;background:#ff7a0014;border:1px solid #ff7a0044;color:#f4d9c4;font-size:12px}.wager-note b{color:#ff9b45}@keyframes bonusPulse{to{transform:translateX(-16px);filter:brightness(1.5)}}@keyframes hFloat{50%{transform:translateY(-18px) rotate(6deg)}}
  `;
  document.head.append(style);
  const polish = document.createElement('style');
  polish.textContent = `
    input,select,textarea,.amount,.quick button,.tabs,.tabs button,.heading button{background:#140e1d!important;color:#fff!important;border-color:#62446d!important;box-shadow:inset 0 0 0 1px #0006!important}
    input::placeholder,textarea::placeholder{color:#917f9f!important}input:focus,select:focus,textarea:focus{border-color:#ff812c!important;box-shadow:0 0 0 3px #ff7a0028!important;outline:none}.amount .unit{background:#2c1e37!important;color:#ffad66!important}.tabs button.active{background:linear-gradient(135deg,#ff7500,#8c2eff)!important}.quick button:active{transform:scale(.96)}
    .bonus-reel{gap:9px!important;padding:16px 8px!important;border-radius:20px!important;background:radial-gradient(circle at 50% 0,#62256b55,transparent 55%),linear-gradient(145deg,#110b18,#1e1027)!important;border:1px solid #754b82!important;box-shadow:inset 0 0 30px #0008,0 12px 30px #0005!important}
    .bonus-reel::before,.bonus-reel::after{content:""!important;position:absolute!important;z-index:5!important;left:50%!important;transform:translateX(-50%)!important;width:0!important;height:0!important;background:transparent!important;box-shadow:none!important;border-left:9px solid transparent!important;border-right:9px solid transparent!important}
    .bonus-reel::before{top:3px!important;border-top:13px solid #ff8b2f!important}.bonus-reel::after{top:auto!important;bottom:3px!important;border-bottom:13px solid #ff8b2f!important}
    .bonus-reel .reward{flex:0 0 66px!important;background:linear-gradient(145deg,#3c2649,#21162d)!important;border:1px solid #805593!important;box-shadow:0 7px 18px #0006!important}.bonus-reel.spinning .reward{animation:bonusRoll 1.25s cubic-bezier(.12,.72,.18,1) forwards!important}
    .admin-entry{margin-top:12px!important;display:flex!important;align-items:center;justify-content:center;gap:9px}.admin-entry::before{content:"⚙️"}
    @keyframes bonusRoll{0%{transform:translateX(0);filter:brightness(1)}72%{transform:translateX(-390px);filter:brightness(1.45)}100%{transform:translateX(-330px);filter:brightness(1)}}
  `;
  document.head.append(polish);

  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const bank = () => players.reduce((sum, player) => sum + player.amount, 0);
  const displayPlayers = () => players.length ? players : [{ name: 'Ожидание', amount: 0 }, { name: 'Игрока', amount: 0 }];

  function stageMarkup() {
    const total = bank();
    const head = `<div class="bor-stage-head"><span class="bor-live"><i></i> LIVE ROUND</span><span class="bor-bank">Банк <b>${total.toFixed(2)} USD</b></span></div>`;
    const status = `<div class="bor-status">${roundStatusText()}</div>`;
    if (mode === 'Арена') {
      const pair = displayPlayers();
      const left = pair[0], right = pair[1] || pair[0];
      const face = p => p.photoUrl ? `<img class="fighter-avatar" src="${esc(p.photoUrl)}" alt="">` : `<div class="fighter-avatar">${esc(p.name[0])}</div>`;
      return `<section class="bor-stage bor-arena">${head}<div class="arena-floor"><div class="fighter left">${face(left)}<b>${esc(left.name)}</b><small>${left.amount.toFixed(2)} USD</small></div><div class="arena-beam"></div><div class="arena-vs">VS</div><div class="fighter right">${face(right)}<b>${esc(right.name)}</b><small>${right.amount.toFixed(2)} USD</small></div></div>${status}</section>`;
    }
    if (mode === 'Колесо') {
      const wheelPlayers = displayPlayers().slice(0, 8);
      const faces = wheelPlayers.map((p, i) => p.photoUrl ? `<img class="wheel-person" style="--angle:${i * 360 / wheelPlayers.length}deg" src="${esc(p.photoUrl)}" title="${esc(p.name)}" alt="">` : `<i class="wheel-person" style="--angle:${i * 360 / wheelPlayers.length}deg" title="${esc(p.name)}">${esc(p.name[0])}</i>`).join('');
      return `<section class="bor-stage bor-wheel">${head}<div class="wheel-wrap"><div class="wheel-pointer"></div><div class="prize-wheel">${faces}</div><div class="wheel-hub">🎃</div></div>${status}</section>`;
    }
    const list = displayPlayers();
    const tickets = Array.from({ length: Math.max(18, list.length * 7) }, (_, index) => {
      const player = list[index % list.length];
      const face = player.photoUrl ? `<img class="h-avatar" src="${esc(player.photoUrl)}" alt="">` : `<span>${esc(player.name[0])}</span>`;
      return `<div class="roulette-ticket">${face}<small>${esc(player.name)}</small></div>`;
    }).join('');
    return `<section class="bor-stage bor-roulette">${head}<div class="roulette-window"><div class="roulette-track">${tickets}</div></div>${status}</section>`;
  }

  function enhanceGame() {
    if (page !== 'game') return;
    const oldStrip = document.querySelector('.strip');
    if (oldStrip && !document.querySelector('.bor-stage')) {
      oldStrip.insertAdjacentHTML('beforebegin', stageMarkup());
      oldStrip.style.display = 'none';
    }
    const opponent = document.getElementById('opponent'); if (opponent) opponent.remove();
    const spin = document.getElementById('spin'); if (spin) spin.remove();
    const bet = document.getElementById('bet'); if (bet) bet.onclick = serverBet;
  }

  async function claimDailyBonus() {
    const button=document.getElementById('daily'); if(!button||!telegramInitData()) return toast('Откройте приложение через Telegram-бота.');
    button.disabled=true; button.textContent='Крутим…'; document.querySelector('.bonus-reel')?.classList.add('spinning');
    try{
      const response=await fetch('/api/bonus/daily',{method:'POST',headers:authHeaders()}); const data=await response.json().catch(()=>({}));
      if(!response.ok){toast(data.error==='BONUS_ALREADY_CLAIMED'?'Бонус уже получен. Возвращайтесь завтра.':'Не удалось получить бонус. Попробуйте позже.'); return}
      st.balance=Number(data.balance); save(); currentProfile={...(currentProfile||{}),balance:data.balance,wagerRemaining:data.wagerRemaining,lastDailyBonus:Date.now()};
      window.updateWithdrawalState?.(data.balance,data.wagerRemaining); toast(`Выпало $${Number(data.amount).toFixed(2)} · вагер x5: $${Number(data.wagerAdded).toFixed(2)}`);
    }catch{toast('Связь прервалась. Попробуйте ещё раз.')}finally{setTimeout(()=>{if(page==='bonus')render()},1400)}
  }
  function enhanceBonus(){
    if(page!=='bonus')return;
    const rewards=document.querySelector('.rewards'); if(rewards){rewards.className='bonus-reel';rewards.innerHTML=[.01,.02,.03,.04,.05,.06,.07,.08,.09,.10].map(n=>`<div class="reward">${n.toFixed(2)}<small>USD</small></div>`).join('');rewards.insertAdjacentHTML('afterend','<div class="wager-note"><span>Максимальный бонус <b>$0.10</b></span><span>Вагер <b>x5</b></span></div>')}
    const button=document.getElementById('daily'); if(!button)return;
    const claimed=Date.now()-Number(currentProfile?.lastDailyBonus||0)<86400000; button.disabled=claimed; button.textContent=claimed?'Бонус получен · вернитесь завтра':'Крутить бонусную рулетку'; button.onclick=claimDailyBonus;
  }

  let activeRound = null, lastAnimatedRound = null, syncBusy = false;
  function telegramInitData(){
    if(window.Telegram?.WebApp?.initData) return window.Telegram.WebApp.initData;
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    return hash.get('tgWebAppData')||'';
  }
  function telegramUser(){
    const sdkUser=window.Telegram?.WebApp?.initDataUnsafe?.user; if(sdkUser) return sdkUser;
    try{return JSON.parse(new URLSearchParams(telegramInitData()).get('user')||'null')}catch{return null}
  }
  const authHeaders = () => ({ 'Content-Type':'application/json', 'X-Telegram-Init-Data': telegramInitData() });
  function roundStatusText() {
    if (!activeRound || activeRound.status === 'waiting') return 'Нужно минимум 2 игрока';
    if (activeRound.status === 'finished') return `Победитель: ${activeRound.winner?.name || '—'}`;
    return `Старт через ${Math.max(0, Math.ceil((activeRound.startAt - Date.now()) / 1000))} сек`;
  }
  async function serverBet() {
    const amount = Number(document.getElementById('amount')?.value);
    if (!telegramInitData()) return toast('Откройте игру через Telegram-бота.');
    try {
      const response = await fetch('/api/game/bet',{method:'POST',headers:authHeaders(),body:JSON.stringify({mode,amount})}); const data=await response.json();
      if(!response.ok) throw new Error(data.message||data.error); activeRound=data.round; st.balance=Number(data.balance); save(); applyRound(); toast('Ставка принята 🎃');
    } catch(error){ toast(error.message||'Ставка не принята'); }
  }
  async function syncRound() {
    if(syncBusy || page!=='game' || !telegramInitData()) return; syncBusy=true;
    try { const response=await fetch(`/api/game/state?mode=${encodeURIComponent(mode)}`,{headers:authHeaders()}); if(!response.ok)return; activeRound=await response.json(); applyRound(); } catch{} finally{syncBusy=false}
  }
  function applyRound(){
    if(!activeRound || page!=='game') return;
    const me=String(telegramUser()?.id||''); players=activeRound.players.map(p=>({...p,amount:Number(p.amount),you:String(p.id)===me}));
    const old=document.querySelector('.bor-stage'); if(old) old.outerHTML=stageMarkup();
    const list=document.getElementById('gamelist'); if(list) list.innerHTML=players.length?players.map(p=>`<div class="row"><span style="display:flex;align-items:center;gap:10px">${p.photoUrl?`<img class="h-avatar" src="${esc(p.photoUrl)}" alt="">`:`<i class="h-avatar">${esc(p.name[0])}</i>`}<b>${esc(p.name)}</b></span><span>${p.amount.toFixed(2)} USD</span></div>`).join(''):'<div class="empty">Сделайте первую ставку!</div>';
    const status=document.querySelector('.bor-status'); if(status) status.innerHTML=activeRound.status==='countdown'?`<span class="h-countdown">${roundStatusText()}</span>`:roundStatusText();
    if(activeRound.status==='finished'&&lastAnimatedRound!==activeRound.id){lastAnimatedRound=activeRound.id;const stage=document.querySelector('.bor-stage');stage?.classList.add(mode==='Арена'?'is-fighting':mode==='Колесо'?'is-wheel':'is-spinning');setTimeout(()=>{stage?.classList.add('winner-flash');confetti();toast(`Победитель: ${activeRound.winner?.name}`)},reducedMotion?100:900)}
  }

  function pickWinner(total) {
    const random = new Uint32Array(1); crypto.getRandomValues(random);
    let point = random[0] / 4294967296 * total, cursor = 0;
    for (const player of players) { cursor += player.amount; if (point < cursor) return player; }
    return players[players.length - 1];
  }

  function confetti() {
    const colors = ['#61eaff','#8468ff','#ff70c9','#ffd164','#6cffac'];
    for (let index = 0; index < 44; index++) {
      const bit = document.createElement('i'); bit.className = 'bor-confetti';
      bit.style.left = `${Math.random() * 100}vw`; bit.style.background = colors[index % colors.length];
      bit.style.setProperty('--drift', `${Math.random() * 180 - 90}px`); bit.style.animationDelay = `${Math.random() * .45}s`;
      document.body.append(bit); setTimeout(() => bit.remove(), 2400);
    }
  }

  function playRound() {
    if (locked || players.length < 2) return;
    locked = true;
    const total = bank();
    const winner = pickWinner(total);
    const stage = document.querySelector('.bor-stage');
    const spin = document.getElementById('spin');
    if (spin) { spin.disabled = true; spin.textContent = 'Идёт розыгрыш…'; }
    if (stage) {
      stage.querySelector('.bor-status').innerHTML = '<strong>Определяем победителя…</strong>';
      stage.classList.add(mode === 'Арена' ? 'is-fighting' : mode === 'Колесо' ? 'is-wheel' : 'is-spinning');
    }
    const duration = reducedMotion ? 250 : (mode === 'Колесо' ? 4050 : 3300);
    setTimeout(() => {
      if (stage) { stage.classList.add('winner-flash'); stage.querySelector('.bor-status').innerHTML = `Победитель: <strong>${esc(winner.name)}</strong> · ${total.toFixed(2)} USD`; }
      confetti();
      setTimeout(() => {
        if (winner.you) { st.balance += total; st.wins++; entry('win', `Выигрыш · ${mode}`, total); }
        st.games++; st.winner = winner.name; st.lastBank = total; players = []; locked = false; save();
        if (page === 'game') render();
        toast(`Победитель: ${winner.name} · ${total.toFixed(2)} USD`);
      }, reducedMotion ? 150 : 950);
    }, duration);
  }

  const baseRender = render;
  render = function enhancedRender() { baseRender(); requestAnimationFrame(()=>{ enhanceGame(); enhanceBonus(); if(currentProfile)applyProfile(currentProfile); }); };
  let currentProfile = null;
  function applyProfile(profile){
    currentProfile=profile;
    st.balance=Number(profile.balance||0); save();
    window.updateWithdrawalState?.(profile.balance,profile.wagerRemaining);
    const tgUser=telegramUser()||{};
    const userName=profile.firstName||tgUser.first_name||profile.username||tgUser.username||'Игрок';
    const headerName=profile.username||tgUser.username?`@${profile.username||tgUser.username}`:userName;
    const name=document.querySelector('header .user small'); if(name) name.textContent=headerName;
    const avatar=document.querySelector('header .avatar'); if(avatar){avatar.textContent='';const photo=profile.photoUrl||tgUser.photo_url;if(photo)avatar.innerHTML=`<img src="${esc(photo)}" alt="" style="width:100%;height:100%;border-radius:inherit;object-fit:cover">`;else avatar.textContent=userName[0]}
    const profileName=document.getElementById('profile-name'); if(profileName)profileName.textContent=userName;
    const profileId=document.getElementById('profile-id'); if(profileId)profileId.textContent=`${headerName} · Telegram ID: ${profile.id}`;
    const profileAvatar=document.getElementById('profile-avatar'); if(profileAvatar){profileAvatar.textContent='';const photo=profile.photoUrl||tgUser.photo_url;if(photo)profileAvatar.innerHTML=`<img src="${esc(photo)}" alt="" style="width:100%;height:100%;border-radius:inherit;object-fit:cover">`;else profileAvatar.textContent=userName[0]}
    if(profile.isAdmin&&document.getElementById('profile-name')&&!document.getElementById('admin-open')){
      const profileCard=document.getElementById('profile-name').closest('.card');
      profileCard?.insertAdjacentHTML('afterend','<button class="primary admin-entry" id="admin-open">Открыть админку</button>');
      const adminButton=document.getElementById('admin-open'); if(adminButton)adminButton.onclick=()=>location.assign(`/admin${location.search}${location.hash}`);
    }
  }
  let profileSyncAttempts=0;
  async function syncProfile(){
    const initData=telegramInitData();
    if(!initData){if(profileSyncAttempts++<12)setTimeout(syncProfile,500);return}
    try{const response=await fetch('/api/profile',{headers:authHeaders()});if(response.ok){applyProfile(await response.json());profileSyncAttempts=99;return}}catch{}
    if(profileSyncAttempts++<12)setTimeout(syncProfile,750);
  }
  const initialUser=telegramUser();
  if(initialUser) applyProfile({id:String(initialUser.id),username:initialUser.username,firstName:initialUser.first_name,photoUrl:initialUser.photo_url,balance:st.balance});
  window.Telegram?.WebApp?.ready?.();
  syncProfile();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncProfile()});
  setInterval(syncRound,1000);
  enhanceGame(); enhanceBonus();
})();



