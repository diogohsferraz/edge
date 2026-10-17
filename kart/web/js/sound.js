/* Sons sintetizados com Web Audio: motor, efeitos e uma trilha simples. */
var Sound = (function () {
  var ctx = null, master = null, musicGain = null, sfxGain = null;
  var enabled = true, musicOn = true;
  var engines = [];
  var musicTimer = null, step = 0, nextTime = 0;

  function unlock() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { return; }
      master = ctx.createGain(); master.gain.value = enabled ? 0.8 : 0; master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
      musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.18 : 0; musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, vol, slide, when) {
    if (!ctx) return;
    var t = when || ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(when ? musicGain : sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    if (!ctx) return;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    var g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start();
  }

  var SFX = {
    count: function () { tone(440, 0.25, 'square', 0.18); },
    go: function () { tone(880, 0.5, 'square', 0.2); },
    item: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, 0.08, 'square', 0.12); }, i * 50); }); },
    roll: function () { tone(600 + Math.random() * 600, 0.04, 'square', 0.05); },
    boost: function () { tone(200, 0.5, 'sawtooth', 0.15, 900); },
    spark: function () { tone(1200, 0.06, 'triangle', 0.08); },
    hit: function () { noise(0.5, 0.4, 900); tone(300, 0.5, 'sawtooth', 0.12, 60); },
    throw: function () { tone(500, 0.2, 'triangle', 0.15, 200); },
    bump: function () { noise(0.15, 0.25, 500); },
    lap: function () { [659, 784, 988].forEach(function (f, i) { setTimeout(function () { tone(f, 0.12, 'square', 0.14); }, i * 90); }); },
    finish: function () { [523, 659, 784, 1046, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, 0.16, 'square', 0.15); }, i * 120); }); },
    select: function () { tone(700, 0.05, 'square', 0.08); },
    confirm: function () { tone(660, 0.07, 'square', 0.1); setTimeout(function () { tone(990, 0.1, 'square', 0.1); }, 60); },
    back: function () { tone(400, 0.08, 'square', 0.08); }
  };

  function play(name) { if (ctx && enabled && SFX[name]) SFX[name](); }

  /* Motor: um oscilador por jogador humano. */
  function setEngines(n) {
    stopEngines();
    if (!ctx) return;
    for (var i = 0; i < n; i++) {
      var o = ctx.createOscillator(), o2 = ctx.createOscillator();
      var f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square';
      f.type = 'lowpass'; f.frequency.value = 600;
      g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxGain);
      o.start(); o2.start();
      engines.push({ o: o, o2: o2, g: g });
    }
  }
  function engine(i, speedRatio, boosting) {
    var e = engines[i];
    if (!e || !ctx) return;
    var t = ctx.currentTime;
    var f = 55 + speedRatio * 110 + (boosting ? 40 : 0);
    e.o.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.g.gain.setTargetAtTime(0.05 + speedRatio * 0.05, t, 0.1);
  }
  function stopEngines() {
    engines.forEach(function (e) { try { e.o.stop(); e.o2.stop(); } catch (x) { /* já parado */ } });
    engines = [];
  }

  /* Trilha: baixo + melodia em loop, agendada à frente. */
  var BASS = [45, 45, 52, 45, 43, 43, 50, 43, 41, 41, 48, 41, 43, 43, 47, 50];
  var LEAD = [69, 0, 72, 74, 76, 0, 74, 72, 67, 0, 69, 72, 71, 0, 67, 0, 69, 0, 72, 74, 76, 79, 76, 74, 72, 0, 71, 69, 71, 0, 0, 0];
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function musicTick() {
    if (!ctx) return;
    var spb = 60 / 132 / 2;
    while (nextTime < ctx.currentTime + 0.3) {
      if (step % 2 === 0) tone(midi(BASS[(step / 2) % 16]), spb * 1.8, 'triangle', 0.5, 0, nextTime);
      var l = LEAD[step % 32];
      if (l) tone(midi(l), spb * 0.9, 'square', 0.18, 0, nextTime);
      if (step % 4 === 2) {
        // chimbal
        var len = Math.floor(ctx.sampleRate * 0.03), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var s = ctx.createBufferSource(); s.buffer = buf; var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
        var g = ctx.createGain(); g.gain.value = 0.25; s.connect(hp); hp.connect(g); g.connect(musicGain); s.start(nextTime);
      }
      nextTime += spb; step++;
    }
  }
  function startMusic() {
    unlock();
    if (!ctx || musicTimer) return;
    nextTime = ctx.currentTime + 0.1; step = 0;
    musicTimer = setInterval(musicTick, 100);
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }

  return {
    unlock: unlock,
    play: play,
    setEngines: setEngines,
    engine: engine,
    stopEngines: stopEngines,
    startMusic: startMusic,
    stopMusic: stopMusic,
    setEnabled: function (v) { enabled = v; if (master) master.gain.value = v ? 0.8 : 0; },
    setMusic: function (v) { musicOn = v; if (musicGain) musicGain.gain.value = v ? 0.18 : 0; }
  };
})();
