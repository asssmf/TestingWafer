import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Heart, Diamond, Club, Spade, Zap, RefreshCw, ShoppingCart, Trophy } from 'lucide-react';

// --- AUDIO ENGINE ---
const AudioEngine = {
  ctx: null,
  init: () => {
    if (!AudioEngine.ctx) {
      AudioEngine.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (AudioEngine.ctx.state === 'suspended') AudioEngine.ctx.resume();
  },
  playTone: (freq, type = 'sine', duration = 0.1, vol = 0.1) => {
    if (!AudioEngine.ctx) return;
    const osc = AudioEngine.ctx.createOscillator();
    const gain = AudioEngine.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, AudioEngine.ctx.currentTime);
    gain.gain.setValueAtTime(vol, AudioEngine.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, AudioEngine.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(AudioEngine.ctx.destination);
    osc.start();
    osc.stop(AudioEngine.ctx.currentTime + duration);
  },
  sfx: {
    hover: () => AudioEngine.playTone(800, 'triangle', 0.02, 0.02),
    select: () => AudioEngine.playTone(600, 'square', 0.05, 0.05),
    play: () => AudioEngine.playTone(300, 'sawtooth', 0.1, 0.1),
    score: (i) => AudioEngine.playTone(400 + (i * 100), 'sine', 0.1, 0.15),
    mult: () => {
      if (!AudioEngine.ctx) return;
      const t = AudioEngine.ctx.currentTime;
      const osc = AudioEngine.ctx.createOscillator();
      const gain = AudioEngine.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.linearRampToValueAtTime(880, t + 0.2);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(AudioEngine.ctx.destination);
      osc.start();
      osc.stop(t + 0.2);
    },
    win: () => {
       [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => 
         setTimeout(() => AudioEngine.playTone(f, 'square', 0.2, 0.1), i * 100)
       );
    },
    cash: () => AudioEngine.playTone(1200, 'sine', 0.1, 0.1)
  }
};

// --- DATA ---
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 10, 'Q': 10, 'K': 10, 'A': 11
};

const HAND_TYPES = {
  'High Card': { chips: 5, mult: 1 },
  'Pair': { chips: 10, mult: 2 },
  'Two Pair': { chips: 20, mult: 2 },
  'Three of a Kind': { chips: 30, mult: 3 },
  'Straight': { chips: 30, mult: 4 },
  'Flush': { chips: 35, mult: 4 },
  'Full House': { chips: 40, mult: 4 },
  'Four of a Kind': { chips: 60, mult: 7 },
  'Straight Flush': { chips: 100, mult: 8 },
};

const JOKERS_DB = [
  { id: 'j1', name: 'Joker', desc: '+4 Mult', cost: 2, rarity: 'common', type: 'passive', effect: () => ({ type: 'mult', val: 4 }) },
  { id: 'j2', name: 'Greedy', desc: '+15 Mult (Hearts)', cost: 5, rarity: 'common', type: 'suit', suit: 'hearts', effect: () => ({ type: 'mult', val: 15 }) },
  { id: 'j3', name: 'Lusty', desc: '+15 Mult (Diamonds)', cost: 5, rarity: 'common', type: 'suit', suit: 'diamonds', effect: () => ({ type: 'mult', val: 15 }) },
  { id: 'j4', name: 'Wrath', desc: '+15 Mult (Spades)', cost: 5, rarity: 'common', type: 'suit', suit: 'spades', effect: () => ({ type: 'mult', val: 15 }) },
  { id: 'j5', name: 'Glutton', desc: '+15 Mult (Clubs)', cost: 5, rarity: 'common', type: 'suit', suit: 'clubs', effect: () => ({ type: 'mult', val: 15 }) },
  { id: 'j6', name: 'Scholar', desc: '+20 Chips (Ace)', cost: 4, rarity: 'common', type: 'rank', rank: 'A', effect: () => ({ type: 'chips', val: 20 }) },
  { id: 'j7', name: 'Half', desc: '+20 Mult (<3 cards)', cost: 6, rarity: 'uncommon', type: 'size', max: 3, effect: () => ({ type: 'mult', val: 20 }) },
  { id: 'j8', name: 'Runner', desc: '+100 Chips (Straight)', cost: 6, rarity: 'uncommon', type: 'hand', hand: 'Straight', effect: () => ({ type: 'chips', val: 100 }) },
  { id: 'j9', name: 'Trio', desc: 'X3 Mult (3 of a kind)', cost: 8, rarity: 'rare', type: 'hand', hand: 'Three of a Kind', effect: () => ({ type: 'x_mult', val: 3 }) },
];

// --- COMPONENTS ---

const Card = ({ card, index, total, selected, onClick, disabled, isPlaying, isScoring, scoreText }) => {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const SuitIcon = { hearts: Heart, diamonds: Diamond, clubs: Club, spades: Spade }[card.suit];
  
  // Fan calculation
  const rotate = isPlaying ? 0 : (index - (total - 1) / 2) * 5;
  const translateY = isPlaying ? 0 : Math.abs(index - (total - 1) / 2) * 5;
  const hoverY = selected ? -30 : -10;

  return (
    <div
      onClick={() => !disabled && onClick(card)}
      onMouseEnter={() => !disabled && AudioEngine.sfx.hover()}
      className={`
        absolute transition-all duration-200 select-none cursor-pointer
        ${isPlaying ? 'relative mx-1' : ''}
        ${isScoring ? 'z-50 scale-125' : ''}
      `}
      style={{
        width: '6rem',
        height: '8.5rem',
        transform: isPlaying 
          ? `scale(${isScoring ? 1.2 : 1})` 
          : `rotate(${rotate}deg) translateY(${selected ? -40 : translateY}px)`,
        zIndex: selected ? 50 : index,
        left: isPlaying ? 'auto' : `calc(50% + ${(index - (total - 1) / 2) * 3.5}rem)`,
        bottom: isPlaying ? 'auto' : '1rem',
        position: isPlaying ? 'relative' : 'absolute',
      }}
    >
      {/* Score Popup */}
      {scoreText && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 text-4xl font-black font-pixel text-white text-stroke-2 animate-float-up z-50 whitespace-nowrap pointer-events-none drop-shadow-md">
           {scoreText}
        </div>
      )}

      {/* Card Body */}
      <div className={`
        w-full h-full bg-white rounded-lg border-2 border-slate-300 shadow-lg flex flex-col justify-between p-1
        ${selected ? 'border-orange-500 ring-4 ring-orange-500/50' : ''}
        ${isScoring ? '!border-yellow-400 !ring-4 !ring-yellow-400 !bg-yellow-50 animate-shake' : ''}
      `}>
        {/* Top */}
        <div className={`flex flex-col items-center leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
          <span className="text-2xl font-black font-pixel tracking-tighter">{card.rank}</span>
          <SuitIcon size={14} fill={isRed ? "currentColor" : "black"} />
        </div>
        {/* Center */}
        <div className="absolute inset-0 flex items-center justify-center opacity-100 pointer-events-none">
           <SuitIcon size={48} fill={isRed ? "currentColor" : "black"} />
        </div>
        {/* Bottom */}
        <div className={`flex flex-col items-center leading-none rotate-180 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
          <span className="text-2xl font-black font-pixel tracking-tighter">{card.rank}</span>
          <SuitIcon size={14} fill={isRed ? "currentColor" : "black"} />
        </div>
      </div>
    </div>
  );
};

const Joker = ({ joker, isScoring, scoreText, sellMode, onSell }) => (
  <div className={`
    relative w-16 h-24 bg-[#232323] border-2 rounded-lg flex flex-col items-center justify-center p-1 shadow-md transition-transform
    ${joker.rarity === 'common' ? 'border-blue-400' : joker.rarity === 'uncommon' ? 'border-green-400' : 'border-red-500'}
    ${isScoring ? 'scale-125 z-50 ring-4 ring-yellow-400 shadow-[0_0_20px_gold]' : 'hover:scale-105'}
  `}>
    {scoreText && (
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-black font-bold px-2 py-1 rounded shadow-lg animate-float-up z-50 whitespace-nowrap font-pixel border border-black">
        {scoreText}
      </div>
    )}
    <div className="text-[10px] font-bold text-white uppercase truncate w-full text-center bg-black/40 rounded px-1">{joker.name}</div>
    <div className="flex-1 flex items-center justify-center text-3xl animate-pulse">🃏</div>
    <div className="text-[8px] leading-tight text-slate-300 text-center">{joker.desc}</div>
    
    {sellMode && (
       <button onClick={(e) => {e.stopPropagation(); onSell(joker)}} className="absolute inset-x-0 bottom-0 bg-red-600 text-[9px] text-white font-bold hover:bg-red-500 uppercase">SELL ${Math.floor(joker.cost/2)}</button>
    )}
  </div>
);

// --- MAIN APP ---

export default function App() {
  // Game State
  const [gameState, setGameState] = useState('MENU');
  const [deck, setDeck] = useState([]);
  const [hand, setHand] = useState([]);
  const [selectedCards, setSelectedCards] = useState([]);
  const [playedCards, setPlayedCards] = useState([]);
  const [jokers, setJokers] = useState([]);
  
  // Economy & Stats
  const [money, setMoney] = useState(4);
  const [round, setRound] = useState(1);
  const [ante, setAnte] = useState(1);
  const [handsLeft, setHandsLeft] = useState(4);
  const [discardsLeft, setDiscardsLeft] = useState(3);
  const [score, setScore] = useState(0);
  const [targetScore, setTargetScore] = useState(300);
  
  // Scoring Visuals
  const [chips, setChips] = useState(0);
  const [mult, setMult] = useState(0);
  const [activeCardId, setActiveCardId] = useState(null);
  const [activeJokerId, setActiveJokerId] = useState(null);
  const [scoreText, setScoreText] = useState(null);
  const [shake, setShake] = useState(0);
  const [shopJokers, setShopJokers] = useState([]);

  // Refs
  const containerRef = useRef(null);

  // Hand Evaluation
  const handInfo = useMemo(() => {
    if (selectedCards.length === 0) return { type: 'High Card', ...HAND_TYPES['High Card'] };
    
    const sorted = [...selectedCards].sort((a,b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
    const ranks = sorted.map(c => c.rank);
    const suits = sorted.map(c => c.suit);
    const vals = sorted.map(c => RANKS.indexOf(c.rank));
    
    const isFlush = suits.every(s => s === suits[0]) && suits.length === 5;
    let isStraight = false;
    const uniqueVals = [...new Set(vals)];
    if(uniqueVals.length >= 5) {
      if(uniqueVals[4] - uniqueVals[0] === 4) isStraight = true;
      if(uniqueVals.includes(12) && uniqueVals.includes(0) && uniqueVals.includes(1) && uniqueVals.includes(2) && uniqueVals.includes(3)) isStraight = true;
    }

    const counts = {};
    ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
    const countVals = Object.values(counts).sort((a,b) => b-a);

    let type = 'High Card';
    if(isFlush && isStraight) type = 'Straight Flush';
    else if(countVals[0] === 4) type = 'Four of a Kind';
    else if(countVals[0] === 3 && countVals[1] === 2) type = 'Full House';
    else if(isFlush) type = 'Flush';
    else if(isStraight) type = 'Straight';
    else if(countVals[0] === 3) type = 'Three of a Kind';
    else if(countVals[0] === 2 && countVals[1] === 2) type = 'Two Pair';
    else if(countVals[0] === 2) type = 'Pair';

    return { type, ...HAND_TYPES[type] };
  }, [selectedCards]);

  // --- LOGIC ---

  const initGame = () => {
    AudioEngine.init();
    AudioEngine.sfx.select();
    const newDeck = [];
    SUITS.forEach(s => RANKS.forEach(r => newDeck.push({id: Math.random(), rank:r, suit:s, value: RANK_VALUES[r]})));
    // Shuffle
    for(let i=newDeck.length-1; i>0; i--) {
        const j = Math.floor(Math.random()*(i+1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    setDeck(newDeck.slice(8));
    setHand(newDeck.slice(0,8));
    setJokers([]);
    setMoney(4);
    setRound(1);
    setAnte(1);
    setScore(0);
    setTargetScore(300);
    setHandsLeft(4);
    setDiscardsLeft(3);
    setGameState('PLAYING');
  };

  const toggleCard = (card) => {
    AudioEngine.sfx.select();
    if (selectedCards.find(c => c.id === card.id)) {
      setSelectedCards(s => s.filter(c => c.id !== card.id));
    } else {
      if (selectedCards.length < 5) setSelectedCards(s => [...s, card]);
    }
  };

  const discard = () => {
    if(discardsLeft < 1 || selectedCards.length === 0) return;
    AudioEngine.sfx.play();
    const remainingHand = hand.filter(c => !selectedCards.find(s => s.id === c.id));
    const drawCount = 8 - remainingHand.length;
    const drawn = deck.slice(0, drawCount);
    setHand([...remainingHand, ...drawn]);
    setDeck(deck.slice(drawCount));
    setSelectedCards([]);
    setDiscardsLeft(d => d - 1);
  };

  const playHand = async () => {
    if(handsLeft < 1 || selectedCards.length === 0) return;
    
    // Setup Scoring
    setGameState('SCORING');
    AudioEngine.sfx.play();
    setPlayedCards([...selectedCards]);
    const remainingHand = hand.filter(c => !selectedCards.find(s => s.id === c.id));
    setHand(remainingHand);
    
    let currentChips = handInfo.chips;
    let currentMult = handInfo.mult;
    setChips(currentChips);
    setMult(currentMult);

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    await wait(500);

    // Score Cards
    for(let i=0; i<selectedCards.length; i++) {
        const card = selectedCards[i];
        setActiveCardId(card.id);
        AudioEngine.sfx.score(i);
        setScoreText(`+${card.value}`);
        currentChips += card.value;
        setChips(currentChips);
        await wait(400);
        setActiveCardId(null);
        setScoreText(null);
    }

    // Score Jokers
    for(const joker of jokers) {
        let triggered = false;
        let effect = null;
        if(joker.type === 'passive') triggered = true;
        if(joker.type === 'suit' && selectedCards.some(c => c.suit === joker.suit)) triggered = true;
        if(joker.type === 'rank' && selectedCards.some(c => c.rank === joker.rank)) triggered = true;
        if(joker.type === 'hand' && joker.hand === handInfo.type) triggered = true;
        if(joker.type === 'size' && selectedCards.length <= joker.max) triggered = true;

        if(triggered) {
            effect = joker.effect();
            setActiveJokerId(joker.id);
            AudioEngine.sfx.mult();
            let txt = '';
            if(effect.type === 'chips') { currentChips += effect.val; txt = `+${effect.val}`; }
            if(effect.type === 'mult') { currentMult += effect.val; txt = `+${effect.val} Mult`; }
            if(effect.type === 'x_mult') { currentMult *= effect.val; txt = `X${effect.val} Mult`; }
            setScoreText(txt);
            setChips(currentChips);
            setMult(currentMult);
            await wait(500);
            setActiveJokerId(null);
            setScoreText(null);
        }
    }

    const handScore = Math.floor(currentChips * currentMult);
    AudioEngine.sfx.win();
    setShake(1);
    
    // Tally Up
    const steps = 20;
    const inc = Math.ceil(handScore / steps);
    for(let i=0; i<steps; i++) {
        setScore(s => Math.min(s + inc, score + handScore));
        await wait(20);
    }
    setScore(score + handScore);
    setShake(0);
    
    await wait(1000);
    setPlayedCards([]);
    setSelectedCards([]);
    
    const totalScore = score + handScore;
    if(totalScore >= targetScore) {
        // Round Win
        setMoney(m => m + 4 + handsLeft); // Reward
        setGameState('SHOP');
        generateShop();
    } else if (handsLeft - 1 <= 0) {
        // Game Over
        setGameState('GAMEOVER');
    } else {
        // Next Hand
        setHandsLeft(h => h - 1);
        const drawCount = 8 - remainingHand.length;
        const drawn = deck.slice(0, drawCount);
        setHand([...remainingHand, ...drawn]);
        setDeck(deck.slice(drawCount));
        setGameState('PLAYING');
    }
  };

  const generateShop = () => {
    const shop = [];
    for(let i=0; i<3; i++) {
        shop.push({ ...JOKERS_DB[Math.floor(Math.random() * JOKERS_DB.length)], uid: Math.random() });
    }
    setShopJokers(shop);
  };

  const buyJoker = (joker) => {
    if(money >= joker.cost && jokers.length < 5) {
        AudioEngine.sfx.cash();
        setMoney(m => m - joker.cost);
        setJokers([...jokers, joker]);
        setShopJokers(s => s.filter(j => j.uid !== joker.uid));
    }
  };

  const nextRound = () => {
    setRound(r => r + 1);
    if(round % 3 === 0) setAnte(a => a + 1);
    setScore(0);
    setTargetScore(Math.floor(targetScore * 1.5));
    setHandsLeft(4);
    setDiscardsLeft(3);
    
    // Reshuffle full deck
    const newDeck = [];
    SUITS.forEach(s => RANKS.forEach(r => newDeck.push({id: Math.random(), rank:r, suit:s, value: RANK_VALUES[r]})));
    for(let i=newDeck.length-1; i>0; i--) {
        const j = Math.floor(Math.random()*(i+1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    setDeck(newDeck.slice(8));
    setHand(newDeck.slice(0,8));
    setGameState('PLAYING');
  };

  // Resize Handler
  useEffect(() => {
    const handleResize = () => {
       if(containerRef.current) {
          const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
          containerRef.current.style.transform = `translate(-50%, -50%) scale(${scale * 0.95})`;
       }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#111] overflow-hidden flex items-center justify-center font-sans select-none">
      
      {/* Styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Jersey+10&family=VT323&display=swap');
        .font-pixel { font-family: 'Jersey 10', monospace; }
        
        .crt-scanlines {
            background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2));
            background-size: 100% 4px;
            pointer-events: none;
        }
        
        .animate-float-up { animation: floatUp 0.8s ease-out forwards; }
        @keyframes floatUp { 0% { transform: translate(-50%, 0); opacity: 1; } 100% { transform: translate(-50%, -60px); opacity: 0; } }
        
        .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shake { 10%, 90% { transform: translate3d(-2px, -1px, 0); } 20%, 80% { transform: translate3d(2px, 2px, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 4px, 0); } 40%, 60% { transform: translate3d(4px, -3px, 0); } }

        .text-stroke-2 { -webkit-text-stroke: 2px black; }
      `}</style>

      {/* --- GAME CANVAS (Fixed 1280x720) --- */}
      <div 
        ref={containerRef}
        className={`relative w-[1280px] h-[720px] bg-[#2C2D33] shadow-2xl overflow-hidden rounded-xl border-4 border-[#1a1a1a] transition-all duration-75 ${shake ? 'animate-shake' : ''}`}
        style={{ position: 'absolute', top: '50%', left: '50%' }}
      >
        
        {/* CRT Overlay */}
        <div className="absolute inset-0 crt-scanlines z-50 pointer-events-none opacity-50"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_50%,rgba(0,0,0,0.6)_100%)] z-40 pointer-events-none"></div>

        {/* --- MENU STATE --- */}
        {gameState === 'MENU' && (
           <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#2C2D33]">
              <h1 className="text-9xl font-black font-pixel text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-orange-600 drop-shadow-[4px_4px_0_black] mb-8">BARATRO</h1>
              <button onClick={initGame} className="px-12 py-4 bg-red-600 border-4 border-white/20 rounded-xl text-4xl font-pixel text-white hover:scale-105 transition-transform shadow-lg">PLAY</button>
           </div>
        )}

        {/* --- GAME STATE --- */}
        {gameState !== 'MENU' && (
        <div className="flex flex-col h-full p-4 gap-4">
            
            {/* TOP ROW: JOKERS */}
            <div className="h-28 flex justify-center items-center gap-3 bg-black/20 rounded-xl border border-white/5">
                {jokers.map(j => (
                    <Joker 
                        key={j.uid || j.id} 
                        joker={j} 
                        isScoring={activeJokerId === j.id}
                        scoreText={activeJokerId === j.id ? scoreText : null}
                        sellMode={gameState === 'SHOP'}
                        onSell={j => setJokers(old => old.filter(x => x.uid !== j.uid))}
                    />
                ))}
                {[...Array(5-jokers.length)].map((_,i) => (
                    <div key={i} className="w-16 h-24 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center text-white/20 text-xs font-bold font-pixel">JOKER</div>
                ))}
            </div>

            {/* MIDDLE ROW: THE BOARD */}
            <div className="flex-1 grid grid-cols-[260px_1fr_200px] gap-4">
                
                {/* LEFT: SCORE HUD */}
                <div className="flex flex-col gap-2">
                    <div className="bg-[#b91c1c] p-4 rounded-xl border-4 border-[#991b1b] shadow-lg flex flex-col justify-between h-44">
                        <div className="text-center">
                            <div className="text-lg font-bold font-pixel text-red-200 uppercase">Round Score</div>
                            <div className="text-5xl font-black font-pixel text-white leading-none drop-shadow-md">{score.toLocaleString()}</div>
                        </div>
                        <div className="bg-black/30 p-2 rounded text-center">
                            <div className="text-xs font-bold font-pixel text-red-200 uppercase">Goal</div>
                            <div className="text-3xl font-black font-pixel text-white">{targetScore.toLocaleString()}</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 flex-1">
                        <div className="bg-[#2563eb] rounded-xl border-4 border-[#1d4ed8] flex flex-col items-center justify-center">
                             <div className="text-xs font-bold font-pixel text-blue-200 uppercase">Hands</div>
                             <div className="text-4xl font-black font-pixel text-white">{handsLeft}</div>
                        </div>
                        <div className="bg-[#dc2626] rounded-xl border-4 border-[#b91c1c] flex flex-col items-center justify-center">
                             <div className="text-xs font-bold font-pixel text-red-200 uppercase">Discards</div>
                             <div className="text-4xl font-black font-pixel text-white">{discardsLeft}</div>
                        </div>
                    </div>
                </div>

                {/* CENTER: PLAY AREA */}
                <div className="relative bg-black/20 rounded-2xl border-2 border-white/5 flex flex-col items-center pt-8">
                     {/* Score Calculation Box */}
                     <div className={`flex items-center gap-2 mb-10 transition-transform duration-200 ${gameState === 'SCORING' ? 'scale-110' : ''}`}>
                         <div className="bg-[#1e293b] px-6 py-3 rounded-xl border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                             <div className="text-xs text-blue-300 font-bold font-pixel uppercase text-center">Chips</div>
                             <div className={`text-4xl font-black font-pixel text-white ${gameState === 'SCORING' ? 'text-blue-100' : ''}`}>
                                 {gameState === 'SCORING' ? chips : handInfo.chips}
                             </div>
                         </div>
                         <div className="text-2xl font-black text-slate-500">X</div>
                         <div className="bg-[#2a0a0a] px-6 py-3 rounded-xl border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                             <div className="text-xs text-red-300 font-bold font-pixel uppercase text-center">Mult</div>
                             <div className={`text-4xl font-black font-pixel text-white ${gameState === 'SCORING' ? 'text-red-100' : ''}`}>
                                 {gameState === 'SCORING' ? mult : handInfo.mult}
                             </div>
                         </div>
                     </div>
                     
                     <div className="bg-[#111] px-6 py-1 rounded-full border border-orange-500/50 mb-4">
                         <span className="text-xl font-bold font-pixel text-orange-500 uppercase tracking-widest">{gameState === 'SCORING' ? 'SCORING...' : handInfo.type}</span>
                     </div>

                     {/* Played Cards Zone */}
                     <div className="h-32 flex items-center justify-center gap-2 w-full">
                        {playedCards.map((c, i) => (
                             <Card 
                                key={c.id} 
                                card={c} 
                                index={i}
                                total={playedCards.length}
                                isPlaying={true}
                                isScoring={activeCardId === c.id}
                                scoreText={activeCardId === c.id ? scoreText : null}
                             />
                        ))}
                     </div>

                     {/* SHOP OVERLAY */}
                     {gameState === 'SHOP' && (
                         <div className="absolute inset-0 z-50 bg-[#2C2D33] rounded-2xl flex flex-col items-center justify-center border-4 border-yellow-600/50">
                             <h2 className="text-6xl font-black font-pixel text-yellow-500 mb-8 drop-shadow-md">SHOP</h2>
                             <div className="flex gap-6 mb-10">
                                 {shopJokers.map(j => (
                                     <div key={j.uid} className="flex flex-col items-center gap-2 group cursor-pointer" onClick={() => buyJoker(j)}>
                                         <Joker joker={j} />
                                         <div className={`px-4 py-1 rounded font-black font-pixel text-lg ${money >= j.cost ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'}`}>${j.cost}</div>
                                     </div>
                                 ))}
                             </div>
                             <div className="flex gap-4">
                                 <button onClick={nextRound} className="px-10 py-3 bg-red-600 text-3xl font-pixel font-bold text-white rounded shadow-lg hover:bg-red-500">NEXT ROUND</button>
                             </div>
                         </div>
                     )}

                     {/* GAMEOVER OVERLAY */}
                     {gameState === 'GAMEOVER' && (
                         <div className="absolute inset-0 z-50 bg-black/90 rounded-2xl flex flex-col items-center justify-center">
                             <h2 className="text-8xl font-black font-pixel text-red-600 mb-4 animate-pulse">GAME OVER</h2>
                             <button onClick={initGame} className="px-10 py-3 bg-white text-3xl font-pixel font-bold text-black rounded hover:scale-105 transition-transform">TRY AGAIN</button>
                         </div>
                     )}
                </div>

                {/* RIGHT: STATS HUD */}
                <div className="flex flex-col gap-2">
                     <div className="flex-1 bg-[#d97706] rounded-xl border-4 border-[#f59e0b] flex flex-col items-center justify-center shadow-lg">
                          <div className="text-xs font-bold font-pixel text-yellow-100 uppercase">Money</div>
                          <div className="text-5xl font-black font-pixel text-white">${money}</div>
                     </div>
                     <div className="flex-1 bg-[#334155] rounded-xl border-4 border-[#475569] flex flex-col items-center justify-center shadow-lg">
                          <div className="text-xs font-bold font-pixel text-slate-400 uppercase">Ante</div>
                          <div className="text-4xl font-black font-pixel text-white mb-1">{ante}<span className="text-2xl text-slate-500">/8</span></div>
                          <div className="text-xs font-bold font-pixel text-slate-300 uppercase">Round {round}</div>
                     </div>
                </div>

            </div>

            {/* BOTTOM ROW: HAND & BUTTONS */}
            <div className="h-[220px] relative">
                 {/* Buttons positioned absolutely to not mess with fan centering */}
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex gap-4">
                     <button 
                        onClick={playHand}
                        disabled={selectedCards.length === 0 || selectedCards.length > 5 || gameState !== 'PLAYING'}
                        className={`
                            px-8 py-3 rounded-lg font-black font-pixel text-2xl uppercase tracking-wider border-b-4 transition-all shadow-xl
                            ${selectedCards.length > 0 && selectedCards.length <= 5 
                              ? 'bg-[#fb923c] border-[#c2410c] text-white hover:-translate-y-1' 
                              : 'bg-gray-700 border-gray-900 text-gray-500 cursor-not-allowed'}
                        `}
                     >
                        Play Hand
                     </button>
                     <button 
                        onClick={discard}
                        disabled={selectedCards.length === 0 || discardsLeft < 1 || gameState !== 'PLAYING'}
                        className={`
                            px-6 py-3 rounded-lg font-black font-pixel text-2xl uppercase tracking-wider border-b-4 transition-all shadow-xl
                            ${selectedCards.length > 0 && discardsLeft > 0
                              ? 'bg-[#ef4444] border-[#991b1b] text-white hover:-translate-y-1' 
                              : 'bg-gray-700 border-gray-900 text-gray-500 cursor-not-allowed'}
                        `}
                     >
                        Discard
                     </button>
                 </div>

                 {/* Hand Fan Container */}
                 <div className="w-full h-full flex justify-center items-end pb-8">
                     <div className="relative w-[600px] h-full">
                         {hand.map((card, i) => (
                             <Card 
                                key={card.id} 
                                card={card} 
                                index={i} 
                                total={hand.length} 
                                selected={!!selectedCards.find(c => c.id === card.id)}
                                onClick={toggleCard}
                                disabled={gameState !== 'PLAYING'}
                             />
                         ))}
                     </div>
                 </div>
            </div>

        </div>
        )}
      </div>
    </div>
  );
}


