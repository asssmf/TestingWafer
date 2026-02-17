import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Heart, Diamond, Club, Spade, Zap, Trophy, Flame } from 'lucide-react';

// --- AUDIO ENGINE (Synthesizer) ---
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
    gain.gain.exponentialRampToValueAtTime(0.01, AudioEngine.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(AudioEngine.ctx.destination);
    osc.start();
    osc.stop(AudioEngine.ctx.currentTime + duration);
  },
  sfx: {
    select: () => AudioEngine.playTone(600, 'triangle', 0.05, 0.1),
    play: () => AudioEngine.playTone(400, 'square', 0.2, 0.2),
    scoreHit: (pitch = 1) => AudioEngine.playTone(300 * pitch, 'sine', 0.15, 0.2), // Louder, faster
    multHit: () => {
      if (!AudioEngine.ctx) return;
      const t = AudioEngine.ctx.currentTime;
      const osc = AudioEngine.ctx.createOscillator();
      const gain = AudioEngine.ctx.createGain();
      osc.type = 'sawtooth'; // Grittier sound
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.linearRampToValueAtTime(800, t + 0.1);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.connect(gain);
      gain.connect(AudioEngine.ctx.destination);
      osc.start();
      osc.stop(t + 0.2);
    },
    glass: () => AudioEngine.playTone(150, 'sawtooth', 0.4, 0.3), // Crunchier impact
    win: () => {
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => 
        setTimeout(() => AudioEngine.playTone(f, 'square', 0.2, 0.2), i * 80)
      );
    }
  }
};

// --- DATA CONSTANTS ---
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
  { id: 'j_joker', name: 'Joker', desc: '+4 Mult', cost: 2, rarity: 'common', trigger: 'passive', effect: () => ({ type: 'mult', val: 4 }) },
  { id: 'j_greedy', name: 'Greedy', desc: '+15 Mult if Heart', cost: 5, rarity: 'common', trigger: 'card_suit', suit: 'hearts', effect: () => ({ type: 'mult', val: 15 }) },
  { id: 'j_wrath', name: 'Wrathful', desc: '+15 Mult if Spade', cost: 5, rarity: 'common', trigger: 'card_suit', suit: 'spades', effect: () => ({ type: 'mult', val: 15 }) },
  { id: 'j_lusty', name: 'Lusty', desc: '+15 Mult if Diamond', cost: 5, rarity: 'common', trigger: 'card_suit', suit: 'diamonds', effect: () => ({ type: 'mult', val: 15 }) },
  { id: 'j_glut', name: 'Glutton', desc: '+15 Mult if Club', cost: 5, rarity: 'common', trigger: 'card_suit', suit: 'clubs', effect: () => ({ type: 'mult', val: 15 }) },
  { id: 'j_smart', name: 'Scholar', desc: '+25 Chips if Ace', cost: 4, rarity: 'common', trigger: 'card_rank', rank: 'A', effect: () => ({ type: 'chips', val: 25 }) },
  { id: 'j_half', name: 'Half Joker', desc: '+20 Mult if <3 cards', cost: 6, rarity: 'uncommon', trigger: 'hand_size', max: 3, effect: () => ({ type: 'mult', val: 20 }) },
  { id: 'j_runner', name: 'Runner', desc: '+15 Chips if Straight', cost: 5, rarity: 'common', trigger: 'hand_type', type: 'Straight', effect: () => ({ type: 'chips', val: 15 }) },
  { id: 'j_banana', name: 'Gros Michel', desc: '+15 Mult', cost: 4, rarity: 'common', trigger: 'passive', effect: () => ({ type: 'mult', val: 15 }) },
  { id: 'j_cardist', name: 'Cardist', desc: 'X1.5 Mult', cost: 8, rarity: 'rare', trigger: 'passive', effect: () => ({ type: 'x_mult', val: 1.5 }) },
];

const BLINDS = [
  { name: 'Small Blind', base: 300, reward: 3 },
  { name: 'Big Blind', base: 450, reward: 4 },
  { name: 'The Wall', base: 800, reward: 5, boss: true },
];

// --- UTILS ---
const createDeck = () => {
  let deck = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      deck.push({ 
        id: `${rank}-${suit}-${Math.random().toString(36).substr(2, 9)}`, 
        rank, 
        suit, 
        value: RANK_VALUES[rank],
      });
    });
  });
  // Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const evaluateHand = (cards) => {
  if (cards.length === 0) return { type: 'High Card', ...HAND_TYPES['High Card'] };
  
  const sorted = [...cards].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
  const ranks = sorted.map(c => c.rank);
  const suits = sorted.map(c => c.suit);
  const values = sorted.map(c => RANKS.indexOf(c.rank));

  const isFlush = suits.every(s => s === suits[0]) && suits.length === 5;
  let isStraight = false;
  let uniqueValues = [...new Set(values)];
  if (uniqueValues.length >= 5) {
      if(uniqueValues[4] - uniqueValues[0] === 4) isStraight = true;
      if (uniqueValues.includes(12) && uniqueValues.includes(0) && uniqueValues.includes(1) && uniqueValues.includes(2) && uniqueValues.includes(3)) isStraight = true;
  }

  const rankCounts = {};
  ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  let type = 'High Card';
  if (isFlush && isStraight) type = 'Straight Flush';
  else if (counts[0] === 4) type = 'Four of a Kind';
  else if (counts[0] === 3 && counts[1] === 2) type = 'Full House';
  else if (isFlush) type = 'Flush';
  else if (isStraight) type = 'Straight';
  else if (counts[0] === 3) type = 'Three of a Kind';
  else if (counts[0] === 2 && counts[1] === 2) type = 'Two Pair';
  else if (counts[0] === 2) type = 'Pair';

  return { type, ...HAND_TYPES[type] };
};

// --- COMPONENTS ---

const Card = ({ card, selected, onClick, disabled, isPlaying, isScoring, scoreDelta }) => {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const SuitIcon = { hearts: Heart, diamonds: Diamond, clubs: Club, spades: Spade }[card.suit];
  
  return (
    <div 
      onClick={() => !disabled && onClick(card)}
      className={`
        relative rounded-lg cursor-pointer select-none border-2 transition-all duration-150
        flex flex-col items-center justify-between p-1 shadow-[0_4px_0_rgba(0,0,0,0.3)]
        ${selected 
            ? '-translate-y-6 z-20 border-orange-500 ring-4 ring-orange-500 bg-orange-50 shadow-[0_0_20px_rgba(249,115,22,0.8)]' 
            : 'hover:-translate-y-2 border-slate-300 bg-white hover:bg-slate-50'}
        ${disabled ? 'brightness-50 cursor-default' : ''}
        ${isScoring ? 'scale-[1.4] z-50 ring-4 ring-yellow-400 !border-yellow-400 animate-pop-slam bg-yellow-50' : ''}
      `}
      style={{
        width: isPlaying ? '5.5rem' : '4.5rem',
        height: isPlaying ? '7.5rem' : '6rem',
        transform: isScoring ? 'rotate(-2deg)' : selected ? 'rotate(0deg)' : `rotate(${(Math.random() * 2 - 1)}deg)`
      }}
    >
      {/* Floating Score Text */}
      {scoreDelta && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 text-4xl font-black text-red-600 animate-float-up z-50 whitespace-nowrap drop-shadow-[2px_2px_0_#000]">
           +{scoreDelta}
        </div>
      )}

      <div className={`self-start flex flex-col items-center leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        <span className="text-2xl font-black font-pixel tracking-tighter">{card.rank}</span>
        <SuitIcon size={14} fill={isRed ? "currentColor" : "black"} />
      </div>

      <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
         <SuitIcon size={50} fill={isRed ? "currentColor" : "black"} />
      </div>

      <div className={`self-end flex flex-col items-center leading-none rotate-180 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        <span className="text-2xl font-black font-pixel tracking-tighter">{card.rank}</span>
        <SuitIcon size={14} fill={isRed ? "currentColor" : "black"} />
      </div>
      
      {/* Gloss */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent rounded-lg pointer-events-none" />
    </div>
  );
};

const Joker = ({ joker, isScoring, sellMode, onSell, triggerText }) => (
  <div className={`
    relative w-16 h-24 md:w-20 md:h-28 bg-slate-900 border-[3px] rounded-xl flex flex-col items-center justify-center p-1 shadow-lg transition-all duration-100 overflow-hidden group
    ${joker.rarity === 'common' ? 'border-cyan-400' : joker.rarity === 'uncommon' ? 'border-green-400' : 'border-rose-500'}
    ${isScoring ? 'scale-125 z-50 ring-4 ring-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.8)] bg-slate-800' : 'hover:scale-105 hover:-translate-y-1'}
  `}>
    
    {/* Dynamic Background */}
    <div className={`absolute inset-0 opacity-20 ${joker.rarity === 'common' ? 'bg-cyan-500' : 'bg-rose-500'}`}></div>

    {triggerText && (
       <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-black font-black text-lg px-3 py-1 rounded-full animate-float-up z-50 whitespace-nowrap shadow-xl border-2 border-black">
          {triggerText}
       </div>
    )}

    <div className="relative z-10 text-[10px] font-black text-white bg-black/50 px-2 rounded uppercase tracking-tight mb-1">{joker.name}</div>
    <div className="relative z-10 flex-1 flex items-center justify-center text-4xl animate-wiggle-slow filter drop-shadow-md">
       🃏
    </div>
    <div className="relative z-10 text-[9px] text-center font-bold leading-tight text-white w-full px-1 drop-shadow-md">{joker.desc}</div>

    {sellMode && (
       <button onClick={(e) => {e.stopPropagation(); onSell(joker)}} className="absolute inset-x-0 bottom-0 bg-red-600 text-[10px] font-bold text-white uppercase py-1 hover:bg-red-500 transition-colors">SELL ${Math.floor(joker.cost/2)}</button>
    )}
  </div>
);

// --- MAIN APP ---

export default function App() {
  const [gameState, setGameState] = useState('MENU');
  const [deck, setDeck] = useState([]);
  const [hand, setHand] = useState([]);
  const [playedCards, setPlayedCards] = useState([]); 
  const [selectedCards, setSelectedCards] = useState([]);
  const [jokers, setJokers] = useState([]);
  
  // Economy
  const [money, setMoney] = useState(4);
  const [ante, setAnte] = useState(1);
  const [round, setRound] = useState(0);
  const [handsLeft, setHandsLeft] = useState(4);
  const [discardsLeft, setDiscardsLeft] = useState(3);
  
  // Scoring
  const [currentRoundScore, setCurrentRoundScore] = useState(0);
  const [handChips, setHandChips] = useState(0);
  const [handMult, setHandMult] = useState(0);
  const [activeCardId, setActiveCardId] = useState(null); 
  const [activeJokerId, setActiveJokerId] = useState(null);
  const [triggerText, setTriggerText] = useState(null);
  const [screenShake, setScreenShake] = useState(0); // 0, 1 (small), 2 (big)
  const [shopJokers, setShopJokers] = useState([]);
  const [message, setMessage] = useState('');
  const [flameEffect, setFlameEffect] = useState(false);

  const currentBlind = BLINDS[round % 3];
  const targetScore = currentBlind.base * Math.pow(1.5, ante - 1);
  const handPreview = useMemo(() => evaluateHand(selectedCards), [selectedCards]);

  // --- ACTIONS ---

  const startGame = () => {
    AudioEngine.init();
    AudioEngine.sfx.select();
    const newDeck = createDeck();
    setDeck(newDeck.slice(8));
    setHand(newDeck.slice(0, 8));
    setJokers([]);
    setMoney(4);
    setAnte(1);
    setRound(0);
    setCurrentRoundScore(0);
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
    if (discardsLeft <= 0 || selectedCards.length === 0) return;
    AudioEngine.sfx.play();
    
    // Animate discard (simplified for speed)
    const remainingHand = hand.filter(c => !selectedCards.find(s => s.id === c.id));
    const needed = 8 - remainingHand.length;
    const drawn = deck.slice(0, needed);
    const newDeck = deck.slice(needed);
    
    setHand([...remainingHand, ...drawn]);
    setDeck(newDeck);
    setSelectedCards([]);
    setDiscardsLeft(d => d - 1);
  };

  const playHand = async () => {
    if (handsLeft <= 0 || selectedCards.length === 0) return;
    AudioEngine.init();
    AudioEngine.sfx.play();

    setGameState('SCORING');
    setPlayedCards([...selectedCards]);
    const remainingHand = hand.filter(c => !selectedCards.find(s => s.id === c.id));
    setHand(remainingHand); 
    
    let chips = handPreview.chips;
    let mult = handPreview.mult;
    setHandChips(chips);
    setHandMult(mult);

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    await wait(400); // Quick setup

    // FASTER Card Scoring Loop
    for (let i = 0; i < selectedCards.length; i++) {
        const card = selectedCards[i];
        
        setActiveCardId(card.id);
        setTriggerText(`+${card.value}`);
        AudioEngine.sfx.scoreHit(1 + (i * 0.15)); // Steeper pitch ramp
        
        chips += card.value;
        setHandChips(chips);
        
        await wait(350); // Snappier
        setActiveCardId(null);
        setTriggerText(null);
    }

    // Joker Triggers
    for (const joker of jokers) {
        let triggered = false;
        let effect = null;
        
        if (joker.trigger === 'passive') triggered = true;
        if (joker.trigger === 'card_suit' && selectedCards.some(c => c.suit === joker.suit)) triggered = true;
        if (joker.trigger === 'hand_type' && joker.type === handPreview.type) triggered = true;
        if (joker.trigger === 'card_rank' && selectedCards.some(c => c.rank === joker.rank)) triggered = true;
        if (joker.trigger === 'hand_size' && selectedCards.length <= joker.max) triggered = true;

        if (triggered) {
            effect = joker.effect();
            setActiveJokerId(joker.id);
            AudioEngine.sfx.multHit(); // Gritty sound
            
            let txt = '';
            if (effect.type === 'chips') { chips += effect.val; txt = `+${effect.val}`; }
            if (effect.type === 'mult') { mult += effect.val; txt = `+${effect.val} Mult`; }
            if (effect.type === 'x_mult') { mult *= effect.val; txt = `X${effect.val} Mult`; }
            
            setTriggerText(txt);
            setHandChips(chips);
            setHandMult(mult);
            
            await wait(500);
            setActiveJokerId(null);
            setTriggerText(null);
        }
    }

    const totalHandScore = Math.floor(chips * mult);
    setScreenShake(2); // BIG SHAKE
    setFlameEffect(true);
    AudioEngine.sfx.glass();
    
    // Rapid Score Counting
    const steps = 10;
    const inc = Math.ceil(totalHandScore / steps);
    for(let i=0; i<steps; i++) {
        setCurrentRoundScore(prev => prev + inc);
        await wait(20); // Very fast tick
    }
    // Correction
    setCurrentRoundScore(prev => { return prev; }); 
    setCurrentRoundScore(s => Math.min(s + 1000000, currentRoundScore + totalHandScore)); 

    await wait(200);
    setScreenShake(0);
    await wait(800);
    setFlameEffect(false);

    setPlayedCards([]);
    setSelectedCards([]);
    
    if (currentRoundScore + totalHandScore >= targetScore) {
       AudioEngine.sfx.win();
       setMessage('BLIND DEFEATED!');
       await wait(1500);
       setMoney(m => m + currentBlind.reward + handsLeft);
       startShop();
    } else if (handsLeft - 1 <= 0) {
       // Check Win again
       if (currentRoundScore + totalHandScore >= targetScore) {
          AudioEngine.sfx.win();
          setMessage('BLIND DEFEATED!');
          await wait(1500);
          setMoney(m => m + currentBlind.reward); 
          startShop();
       } else {
          setGameState('GAMEOVER');
       }
    } else {
       setHandsLeft(h => h - 1);
       const needed = 8 - remainingHand.length;
       const drawn = deck.slice(0, needed);
       const newDeck = deck.slice(needed);
       setHand([...remainingHand, ...drawn]);
       setDeck(newDeck);
       setGameState('PLAYING');
    }
  };

  const startShop = () => {
    setMessage('');
    setGameState('SHOP');
    const shop = [];
    for(let i=0; i<3; i++) {
        const t = JOKERS_DB[Math.floor(Math.random() * JOKERS_DB.length)];
        shop.push({ ...t, uid: Math.random() });
    }
    setShopJokers(shop);
  };

  const buyJoker = (joker) => {
    if (money >= joker.cost && jokers.length < 5) {
        AudioEngine.sfx.select();
        setMoney(m => m - joker.cost);
        setJokers([...jokers, joker]);
        setShopJokers(s => s.filter(j => j.uid !== joker.uid));
    }
  };

  const nextRound = () => {
    setRound(r => r + 1);
    if ((round + 1) % 3 === 0) setAnte(a => a + 1);
    setCurrentRoundScore(0);
    setHandsLeft(4);
    setDiscardsLeft(3);
    const newDeck = createDeck();
    setDeck(newDeck.slice(8));
    setHand(newDeck.slice(0, 8));
    setGameState('PLAYING');
  };

  // --- RENDER ---
  const shakeClass = screenShake === 2 ? 'animate-shake-hard' : screenShake === 1 ? 'animate-shake' : '';

  return (
    <div className={`min-h-screen bg-[#110524] text-white font-sans overflow-hidden select-none relative crt-container ${shakeClass}`}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Jersey+10&display=swap');
        .font-pixel { font-family: 'Jersey 10', monospace; }
        
        .crt-container::after {
          content: " ";
          display: block;
          position: absolute;
          top: 0; left: 0; bottom: 0; right: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
          z-index: 50;
          background-size: 100% 2px, 3px 100%;
          pointer-events: none;
        }

        /* Highly Saturated Text Glow */
        .text-glow-red { text-shadow: 0 0 10px #ef4444, 0 0 20px #ef4444; }
        .text-glow-blue { text-shadow: 0 0 10px #3b82f6, 0 0 20px #3b82f6; }
        
        .animate-float-up { animation: floatUp 0.5s ease-out forwards; }
        @keyframes floatUp {
           0% { transform: translate(-50%, 0) scale(1); opacity: 1; }
           100% { transform: translate(-50%, -60px) scale(1.5); opacity: 0; }
        }

        .animate-pop-slam { animation: popSlam 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes popSlam {
           0% { transform: scale(1) rotate(0deg); }
           50% { transform: scale(1.5) rotate(-5deg); }
           100% { transform: scale(1) rotate(0deg); }
        }

        .animate-shake-hard { animation: shakeHard 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shakeHard {
          10%, 90% { transform: translate3d(-4px, -2px, 0); }
          20%, 80% { transform: translate3d(6px, 4px, 0); }
          30%, 50%, 70% { transform: translate3d(-10px, 4px, 0); }
          40%, 60% { transform: translate3d(10px, -4px, 0); }
        }
        
        .bg-pattern {
            background-image: radial-gradient(#ffffff 1px, transparent 1px);
            background-size: 30px 30px;
        }
      `}</style>

      {/* Background - Richer Purple/Black */}
      <div className="absolute inset-0 bg-[#0f0518] bg-pattern opacity-10"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80"></div>

      {gameState === 'MENU' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-black/90">
           <h1 className="text-9xl font-black font-pixel text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-orange-600 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] mb-6 animate-pulse">
              BARATRO
           </h1>
           <button onClick={startGame} className="px-16 py-6 bg-red-600 text-4xl font-black font-pixel uppercase rounded-xl shadow-[0_8px_0_#991b1b] hover:translate-y-1 hover:shadow-[0_4px_0_#991b1b] active:translate-y-2 active:shadow-none transition-all border-2 border-red-400">
              Play
           </button>
        </div>
      )}

      {/* Main UI */}
      <div className="relative z-10 flex flex-col h-screen max-w-7xl mx-auto p-4 md:p-6">
        
        {/* Top HUD */}
        <div className="flex justify-between h-36 mb-4 gap-4">
           {/* Scoreboard */}
           <div className="bg-[#1e1e24] rounded-xl p-4 border-2 border-slate-700 w-1/4 flex flex-col justify-between shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                 <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Current Score</div>
                 <div className="text-4xl font-black font-pixel text-white leading-none tracking-tighter drop-shadow-md">{currentRoundScore.toLocaleString()}</div>
                 <div className="text-xs text-slate-500 mt-2">Target: <span className="text-red-400 font-bold text-lg">{Math.floor(targetScore).toLocaleString()}</span></div>
              </div>
              <div className="flex justify-between text-center pt-2 border-t border-slate-700/50 relative z-10">
                 <div>
                    <div className="text-[10px] text-blue-400 uppercase font-bold">Hands</div>
                    <div className="text-2xl font-black font-pixel text-blue-500">{handsLeft}</div>
                 </div>
                 <div>
                    <div className="text-[10px] text-red-400 uppercase font-bold">Discards</div>
                    <div className="text-2xl font-black font-pixel text-red-500">{discardsLeft}</div>
                 </div>
              </div>
           </div>

           {/* Joker Rack */}
           <div className="flex-1 flex justify-center items-center gap-3 px-4 bg-[#141418] rounded-xl border border-white/5 shadow-inner">
               {jokers.map(j => (
                   <Joker 
                      key={j.uid || j.id} 
                      joker={j} 
                      isScoring={activeJokerId === j.id} 
                      triggerText={activeJokerId === j.id ? triggerText : null}
                      sellMode={gameState === 'SHOP'}
                      onSell={j => setJokers(old => old.filter(x => x.uid !== j.uid))}
                   />
               ))}
               {[...Array(5-jokers.length)].map((_, i) => (
                   <div key={i} className="w-16 h-24 md:w-20 md:h-28 border-2 border-dashed border-slate-700 rounded-xl bg-white/5 flex items-center justify-center text-slate-600 font-bold text-xs uppercase tracking-widest opacity-50">Slot</div>
               ))}
           </div>

           {/* Stats */}
           <div className="w-48 flex flex-col gap-2">
               <div className="flex-1 bg-[#1e1e24] border-2 border-amber-600 rounded-xl p-2 flex flex-col items-center justify-center shadow-[0_4px_0_rgba(0,0,0,0.2)]">
                   <div className="text-[10px] text-amber-500 uppercase font-bold">Bank</div>
                   <div className="text-4xl font-black text-white font-pixel text-glow-gold">${money}</div>
               </div>
               <div className="flex-1 bg-[#1e2030] border-2 border-blue-500/40 rounded-xl p-2 text-center flex flex-col justify-center">
                   <div className="text-[10px] text-blue-300 uppercase font-bold">Ante <span className="text-white text-lg ml-1 font-pixel">{ante}</span></div>
                   <div className="text-[10px] text-slate-400 font-bold tracking-tight">{currentBlind.name}</div>
               </div>
           </div>
        </div>

        {/* Play Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative my-2">
            
            {/* The Chip/Mult Display */}
            <div className={`transition-all duration-200 mb-10 transform ${gameState === 'SCORING' ? 'scale-110' : 'scale-100'}`}>
                <div className={`flex items-center gap-4 bg-black/60 p-6 rounded-3xl border-2 border-white/10 shadow-2xl backdrop-blur-md ${flameEffect ? 'ring-4 ring-orange-500 bg-orange-900/40' : ''}`}>
                   {/* Chips */}
                   <div className="bg-[#0f172a] px-6 py-3 rounded-2xl border-2 border-blue-500 min-w-[140px] text-center shadow-[0_0_25px_rgba(59,130,246,0.4)] relative overflow-hidden">
                      <div className="absolute inset-0 bg-blue-500/10 animate-pulse"></div>
                      <div className="relative z-10 text-[10px] text-blue-300 uppercase font-black tracking-widest">Chips</div>
                      <div className={`relative z-10 text-5xl font-black font-pixel text-white ${gameState === 'SCORING' ? 'text-blue-100 scale-110' : ''} transition-all`}>
                         {(gameState === 'SCORING' ? handChips : handPreview.chips)}
                      </div>
                   </div>
                   
                   <div className="text-white font-black text-3xl opacity-50">X</div>

                   {/* Mult */}
                   <div className="bg-[#1f0505] px-6 py-3 rounded-2xl border-2 border-red-500 min-w-[140px] text-center shadow-[0_0_25px_rgba(239,68,68,0.4)] relative overflow-hidden">
                      <div className="absolute inset-0 bg-red-500/10 animate-pulse"></div>
                      <div className="relative z-10 text-[10px] text-red-300 uppercase font-black tracking-widest">Mult</div>
                      <div className={`relative z-10 text-5xl font-black font-pixel text-white ${gameState === 'SCORING' ? 'text-red-100 scale-110' : ''} transition-all`}>
                         {(gameState === 'SCORING' ? handMult : handPreview.mult)}
                      </div>
                   </div>
                </div>
                {/* Hand Label */}
                <div className="text-center mt-6">
                    <span className="bg-[#0f172a] border-2 border-orange-500 text-orange-400 px-6 py-2 rounded-full text-xl font-black font-pixel uppercase tracking-widest shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                        {gameState === 'SCORING' ? 'CALCULATING...' : handPreview.type}
                    </span>
                </div>
            </div>

            {/* Active Played Cards */}
            <div className="h-40 flex items-center justify-center gap-3">
               {playedCards.map((card) => (
                  <Card 
                     key={card.id} 
                     card={card} 
                     isPlaying={true}
                     isScoring={activeCardId === card.id}
                     scoreDelta={activeCardId === card.id ? triggerText : null}
                  />
               ))}
            </div>

            {/* Notifications */}
            {message && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-slate-900 border-y-8 border-red-600 text-7xl font-black font-pixel text-white px-16 py-10 animate-pop-slam shadow-[0_0_100px_rgba(0,0,0,0.8)] z-50">
                        {message}
                    </div>
                </div>
            )}

            {/* Shop Overlay */}
            {gameState === 'SHOP' && (
                <div className="absolute inset-0 bg-[#0f0518]/95 z-40 flex flex-col items-center justify-center rounded-xl border border-yellow-500/20 backdrop-blur-sm">
                    <h2 className="text-6xl font-black font-pixel text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 mb-2 uppercase drop-shadow-sm">Bazaar</h2>
                    <div className="h-1 w-20 bg-yellow-600 mb-8 rounded-full"></div>
                    
                    <div className="flex gap-8 mb-12">
                        {shopJokers.map(j => (
                            <div key={j.uid} className="flex flex-col items-center group cursor-pointer transition-transform hover:scale-105" onClick={() => buyJoker(j)}>
                                <Joker joker={j} />
                                <div className={`mt-3 px-4 py-1 rounded-lg font-black text-lg font-pixel ${money >= j.cost ? 'bg-green-600 text-white shadow-[0_4px_0_#166534]' : 'bg-slate-700 text-slate-500'} uppercase`}>
                                    ${j.cost}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button onClick={nextRound} className="px-12 py-4 bg-red-600 text-3xl font-black font-pixel uppercase rounded-xl shadow-[0_6px_0_#991b1b] hover:translate-y-1 hover:shadow-[0_4px_0_#991b1b] active:translate-y-2 active:shadow-none transition-all border-2 border-red-500">
                        Next Round
                    </button>
                </div>
            )}
        </div>

        {/* Hand Controls */}
        <div className="h-44 flex flex-col justify-end pb-4">
           {gameState === 'PLAYING' && (
               <div className="flex justify-center gap-6 mb-6">
                   <button 
                      onClick={playHand} 
                      disabled={selectedCards.length === 0 || selectedCards.length > 5}
                      className={`px-10 py-3 rounded-xl font-black font-pixel text-2xl uppercase tracking-wider transition-all shadow-[0_6px_0_rgba(0,0,0,0.4)] border-2
                        ${selectedCards.length > 0 && selectedCards.length <= 5 
                            ? 'bg-blue-600 hover:bg-blue-500 hover:-translate-y-1 text-white border-blue-400 shadow-blue-900/50' 
                            : 'bg-slate-800 text-slate-600 cursor-not-allowed border-slate-700'}
                      `}
                   >
                       Play Hand
                   </button>
                   <button 
                      onClick={discard}
                      disabled={selectedCards.length === 0 || discardsLeft <= 0}
                      className={`px-8 py-3 rounded-xl font-black font-pixel text-2xl uppercase tracking-wider transition-all shadow-[0_6px_0_rgba(0,0,0,0.4)] border-2
                        ${selectedCards.length > 0 && discardsLeft > 0 
                            ? 'bg-red-600 hover:bg-red-500 hover:-translate-y-1 text-white border-red-400 shadow-red-900/50' 
                            : 'bg-slate-800 text-slate-600 cursor-not-allowed border-slate-700'}
                      `}
                   >
                       Discard
                   </button>
               </div>
           )}

           <div className="flex justify-center items-end h-32 perspective-1000">
               <div className="flex -space-x-8 md:-space-x-10 px-4 transition-all duration-300 hover:-space-x-6">
                   {hand.map(card => (
                       <Card 
                          key={card.id} 
                          card={card} 
                          selected={!!selectedCards.find(c => c.id === card.id)} 
                          onClick={toggleCard}
                          disabled={gameState !== 'PLAYING'}
                       />
                   ))}
               </div>
           </div>
        </div>

      </div>

      {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center">
             <h1 className="text-8xl font-black font-pixel text-white mb-2 text-glow-red animate-pulse">GAME OVER</h1>
             <p className="text-3xl font-mono text-slate-400 mb-10 uppercase tracking-widest">Round {round + 1} Reached</p>
             <button onClick={startGame} className="px-10 py-4 bg-white text-black font-black text-2xl uppercase rounded-xl font-pixel hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.4)]">
                Restart Run
             </button>
          </div>
      )}

    </div>
  );
}


