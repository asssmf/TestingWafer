import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Heart, Diamond, Club, Spade, Zap, Trophy, Flame, ShoppingCart, RotateCcw } from 'lucide-react';

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
    gain.gain.exponentialRampToValueAtTime(0.01, AudioEngine.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(AudioEngine.ctx.destination);
    osc.start();
    osc.stop(AudioEngine.ctx.currentTime + duration);
  },
  sfx: {
    select: () => AudioEngine.playTone(800, 'triangle', 0.05, 0.05),
    error: () => AudioEngine.playTone(150, 'sawtooth', 0.2, 0.1),
    play: () => AudioEngine.playTone(400, 'square', 0.2, 0.1),
    scoreHit: (i) => AudioEngine.playTone(300 + (i*50), 'sine', 0.1, 0.1),
    multHit: () => {
       if(!AudioEngine.ctx) return;
       const t = AudioEngine.ctx.currentTime;
       const osc = AudioEngine.ctx.createOscillator();
       const gain = AudioEngine.ctx.createGain();
       osc.type = 'sawtooth';
       osc.frequency.setValueAtTime(220, t);
       osc.frequency.linearRampToValueAtTime(880, t + 0.15);
       gain.gain.setValueAtTime(0.1, t);
       gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
       osc.connect(gain);
       gain.connect(AudioEngine.ctx.destination);
       osc.start();
       osc.stop(t + 0.2);
    },
    glass: () => AudioEngine.playTone(1000, 'sawtooth', 0.1, 0.05),
    win: () => {
       [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => 
         setTimeout(() => AudioEngine.playTone(f, 'square', 0.2, 0.1), i * 100)
       );
    }
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
  { id: 'j_smeared', name: 'Smeared', desc: '+50 Chips', cost: 5, rarity: 'common', trigger: 'passive', effect: () => ({ type: 'chips', val: 50 }) },
];

const BLINDS = [
  { name: 'Small Blind', base: 300, reward: 3 },
  { name: 'Big Blind', base: 450, reward: 4 },
  { name: 'Boss Blind', base: 600, reward: 5, boss: true },
];

// --- UTILS ---
const createDeck = () => {
  let deck = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      deck.push({ id: `${rank}-${suit}-${Math.random().toString(36).substr(2,9)}`, rank, suit, value: RANK_VALUES[rank] });
    });
  });
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

const Card = ({ card, selected, onClick, disabled, isScoring, scoreDelta, isPlayed }) => {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const SuitIcon = { hearts: Heart, diamonds: Diamond, clubs: Club, spades: Spade }[card.suit];
  
  return (
    <div 
      onClick={() => !disabled && onClick(card)}
      className={`
        relative rounded-[6px] cursor-pointer select-none transition-all duration-100 ease-out
        flex flex-col items-center justify-between p-1
        ${selected 
            ? '-translate-y-6 z-20 border-[3px] border-orange-500 bg-white shadow-[0_0_15px_rgba(249,115,22,0.8)]' 
            : 'hover:-translate-y-2 border-[2px] border-slate-300 bg-gray-100 hover:bg-white'}
        ${disabled ? 'brightness-50 cursor-default pointer-events-none' : ''}
        ${isScoring ? 'scale-125 z-50 ring-4 ring-yellow-400 !border-yellow-400 animate-pop bg-yellow-50' : ''}
      `}
      style={{
        width: isPlayed ? '5rem' : '5rem',
        height: isPlayed ? '7rem' : '7rem',
        transform: isScoring ? 'rotate(-2deg)' : selected ? 'rotate(0deg)' : `rotate(0deg)`,
        boxShadow: selected ? '0 10px 0 rgba(0,0,0,0.4)' : '0 4px 0 rgba(0,0,0,0.4)'
      }}
    >
      {scoreDelta && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-3xl font-black text-red-600 animate-float-up z-50 whitespace-nowrap drop-shadow-[2px_2px_0_#fff] font-pixel">
           +{scoreDelta}
        </div>
      )}

      <div className={`self-start flex flex-col items-center leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        <span className="text-xl font-black font-pixel tracking-tighter">{card.rank}</span>
        <SuitIcon size={12} fill={isRed ? "currentColor" : "black"} />
      </div>

      <div className="absolute inset-0 flex items-center justify-center opacity-100 pointer-events-none">
         <SuitIcon size={40} fill={isRed ? "currentColor" : "black"} />
      </div>

      <div className={`self-end flex flex-col items-center leading-none rotate-180 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        <span className="text-xl font-black font-pixel tracking-tighter">{card.rank}</span>
        <SuitIcon size={12} fill={isRed ? "currentColor" : "black"} />
      </div>
    </div>
  );
};

const Joker = ({ joker, isScoring, sellMode, onSell, triggerText }) => (
  <div className={`
    relative w-16 h-24 bg-[#2a2a35] border-[3px] rounded-lg flex flex-col items-center justify-center p-1 shadow-lg transition-all duration-100 overflow-hidden group shrink-0
    ${joker.rarity === 'common' ? 'border-blue-400' : joker.rarity === 'uncommon' ? 'border-green-400' : 'border-red-500'}
    ${isScoring ? 'scale-110 z-50 ring-4 ring-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.8)]' : 'hover:scale-105'}
  `}>
    {triggerText && (
       <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black font-black text-sm px-2 py-1 rounded animate-float-up z-50 whitespace-nowrap shadow-xl border border-black font-pixel">
          {triggerText}
       </div>
    )}
    <div className="text-[9px] font-bold text-white uppercase tracking-tight mb-1 w-full text-center truncate">{joker.name}</div>
    <div className="flex-1 flex items-center justify-center text-3xl animate-pulse">🃏</div>
    <div className="text-[8px] text-center font-bold leading-tight text-slate-300 w-full px-1">{joker.desc}</div>
    {sellMode && (
       <button onClick={(e) => {e.stopPropagation(); onSell(joker)}} className="absolute inset-x-0 bottom-0 bg-red-600 text-[8px] font-bold text-white uppercase py-1 hover:bg-red-500 transition-colors z-20">SELL ${Math.floor(joker.cost/2)}</button>
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
  
  // Stats
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
  const [screenShake, setScreenShake] = useState(0); 
  const [shopJokers, setShopJokers] = useState([]);
  const [message, setMessage] = useState('');
  
  const currentBlind = BLINDS[round % 3];
  const targetScore = currentBlind.base * Math.pow(1.5, ante - 1);
  const handPreview = useMemo(() => evaluateHand(selectedCards), [selectedCards]);

  // --- LOGIC ---

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
    if (discardsLeft <= 0 || selectedCards.length === 0) return AudioEngine.sfx.error();
    AudioEngine.sfx.play();
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
    if (handsLeft <= 0 || selectedCards.length === 0) return AudioEngine.sfx.error();
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
    await wait(500); 

    // Score Cards
    for (let i = 0; i < selectedCards.length; i++) {
        const card = selectedCards[i];
        setActiveCardId(card.id);
        setTriggerText(`+${card.value}`);
        AudioEngine.sfx.scoreHit(i);
        chips += card.value;
        setHandChips(chips);
        await wait(300); 
        setActiveCardId(null);
        setTriggerText(null);
    }

    // Score Jokers
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
            AudioEngine.sfx.multHit();
            let txt = '';
            if (effect.type === 'chips') { chips += effect.val; txt = `+${effect.val}`; }
            if (effect.type === 'mult') { mult += effect.val; txt = `+${effect.val} Mult`; }
            if (effect.type === 'x_mult') { mult *= effect.val; txt = `X${effect.val} Mult`; }
            setTriggerText(txt);
            setHandChips(chips);
            setHandMult(mult);
            await wait(400);
            setActiveJokerId(null);
            setTriggerText(null);
        }
    }

    const totalHandScore = Math.floor(chips * mult);
    setScreenShake(2); 
    AudioEngine.sfx.glass();
    
    // Score Tally
    const steps = 15;
    const inc = Math.ceil(totalHandScore / steps);
    for(let i=0; i<steps; i++) {
        setCurrentRoundScore(prev => prev + inc);
        await wait(20); 
    }
    setCurrentRoundScore(s => Math.min(s + 1000000, currentRoundScore + totalHandScore)); 

    await wait(300);
    setScreenShake(0);
    await wait(800);

    setPlayedCards([]);
    setSelectedCards([]);
    
    if (currentRoundScore + totalHandScore >= targetScore) {
       AudioEngine.sfx.win();
       setMessage('BLIND DEFEATED');
       await wait(2000);
       setMoney(m => m + currentBlind.reward + handsLeft);
       startShop();
    } else if (handsLeft - 1 <= 0) {
       if (currentRoundScore + totalHandScore >= targetScore) {
          AudioEngine.sfx.win();
          setMessage('BLIND DEFEATED');
          await wait(2000);
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
    <div className={`fixed inset-0 bg-[#2c2d33] text-white overflow-hidden select-none crt-overlay ${shakeClass}`}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Jersey+10&display=swap');
        .font-pixel { font-family: 'Jersey 10', monospace; }
        
        .crt-overlay::after {
          content: " ";
          display: block;
          position: absolute;
          top: 0; left: 0; bottom: 0; right: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
          z-index: 50;
          background-size: 100% 2px, 3px 100%;
          pointer-events: none;
        }

        .animate-float-up { animation: floatUp 0.6s ease-out forwards; }
        @keyframes floatUp {
           0% { transform: translate(-50%, 0) scale(1); opacity: 1; }
           100% { transform: translate(-50%, -40px) scale(1.5); opacity: 0; }
        }

        .animate-pop { animation: pop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes pop {
           0% { transform: scale(1); }
           50% { transform: scale(1.3); }
           100% { transform: scale(1); }
        }

        .animate-shake-hard { animation: shakeHard 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shakeHard {
          10%, 90% { transform: translate3d(-4px, -2px, 0); }
          20%, 80% { transform: translate3d(6px, 4px, 0); }
          30%, 50%, 70% { transform: translate3d(-10px, 4px, 0); }
          40%, 60% { transform: translate3d(10px, -4px, 0); }
        }

        /* Scanline scrolling */
        @keyframes scanline {
            0% { background-position: 0% 0%; }
            100% { background-position: 0% 100%; }
        }
      `}</style>
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[#2c2d33]">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-700 via-gray-900 to-black"></div>
      </div>

      {gameState === 'MENU' ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#2c2d33]">
           <h1 className="text-9xl font-black font-pixel text-transparent bg-clip-text bg-gradient-to-br from-red-500 to-orange-500 drop-shadow-[4px_4px_0_rgba(0,0,0,1)] mb-8 animate-pulse">
              BARATRO
           </h1>
           <button onClick={startGame} className="group relative px-16 py-6 bg-red-600 border-4 border-white/20 rounded-xl shadow-[0_10px_0_rgba(0,0,0,0.5)] active:translate-y-2 active:shadow-none transition-all">
              <span className="text-4xl font-black font-pixel uppercase text-white drop-shadow-md group-hover:scale-110 block transition-transform">Play</span>
           </button>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col h-full p-2 max-w-7xl mx-auto">
            
            {/* TOP BAR: JOKERS */}
            <div className="h-32 mb-2 flex justify-center items-center gap-3 p-2 bg-black/20 rounded-xl border border-white/5">
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
                    <div key={i} className="w-16 h-24 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center text-white/20 text-xs font-bold font-pixel">JOKER</div>
                ))}
            </div>

            {/* MAIN STAGE GRID */}
            <div className="flex-1 grid grid-cols-[260px_1fr_200px] gap-4 min-h-0">
                
                {/* LEFT COL: SCORING */}
                <div className="flex flex-col gap-2">
                    {/* Score Panel */}
                    <div className="bg-[#a83232] rounded-xl p-4 border-[3px] border-[#d94a4a] shadow-lg flex flex-col justify-between h-40">
                         <div>
                             <div className="text-sm font-bold font-pixel text-[#ffcccc] uppercase">Round Score</div>
                             <div className="text-4xl font-black font-pixel text-white leading-none tracking-tight">{currentRoundScore.toLocaleString()}</div>
                         </div>
                         <div className="text-right">
                             <div className="text-xs font-bold font-pixel text-[#ffcccc] uppercase">Target</div>
                             <div className="text-2xl font-black font-pixel text-white">{Math.floor(targetScore).toLocaleString()}</div>
                         </div>
                    </div>
                    {/* Hands/Discards */}
                    <div className="grid grid-cols-2 gap-2 flex-1">
                        <div className="bg-[#3b82f6] rounded-xl p-2 border-[3px] border-[#60a5fa] flex flex-col items-center justify-center shadow-md">
                            <div className="text-xs font-bold font-pixel text-blue-100 uppercase">Hands</div>
                            <div className="text-3xl font-black font-pixel text-white">{handsLeft}</div>
                        </div>
                        <div className="bg-[#ef4444] rounded-xl p-2 border-[3px] border-[#f87171] flex flex-col items-center justify-center shadow-md">
                            <div className="text-xs font-bold font-pixel text-red-100 uppercase">Discards</div>
                            <div className="text-3xl font-black font-pixel text-white">{discardsLeft}</div>
                        </div>
                    </div>
                </div>

                {/* CENTER COL: PLAY AREA */}
                <div className="relative flex flex-col justify-center items-center bg-black/20 rounded-2xl border border-white/5 p-4">
                    {/* Score Preview Box */}
                    <div className={`flex flex-col items-center mb-8 transition-all duration-200 ${gameState === 'SCORING' ? 'scale-110' : ''}`}>
                         <div className="flex items-center gap-2 bg-[#1a1a1a] p-3 rounded-xl border-2 border-gray-700 shadow-2xl">
                             <div className="bg-[#0f172a] px-4 py-2 rounded-lg border-2 border-blue-500 min-w-[100px] text-center">
                                 <div className="text-[10px] uppercase font-bold text-blue-300 tracking-wider">Chips</div>
                                 <div className={`text-3xl font-black font-pixel text-white ${gameState === 'SCORING' ? 'text-blue-200' : ''}`}>{gameState === 'SCORING' ? handChips : handPreview.chips}</div>
                             </div>
                             <span className="text-xl font-black text-gray-500">X</span>
                             <div className="bg-[#2a0a0a] px-4 py-2 rounded-lg border-2 border-red-500 min-w-[100px] text-center">
                                 <div className="text-[10px] uppercase font-bold text-red-300 tracking-wider">Mult</div>
                                 <div className={`text-3xl font-black font-pixel text-white ${gameState === 'SCORING' ? 'text-red-200' : ''}`}>{gameState === 'SCORING' ? handMult : handPreview.mult}</div>
                             </div>
                         </div>
                         <div className="mt-2 bg-[#1a1a1a] px-4 py-1 rounded-full border border-orange-500/50">
                             <span className="text-lg font-black font-pixel text-orange-500 uppercase tracking-widest">{gameState === 'SCORING' ? 'SCORING' : handPreview.type}</span>
                         </div>
                    </div>

                    {/* Played Cards */}
                    <div className="h-32 w-full flex items-center justify-center gap-2">
                        {playedCards.map((card) => (
                          <Card 
                             key={card.id} 
                             card={card} 
                             isPlayed={true}
                             isScoring={activeCardId === card.id}
                             scoreDelta={activeCardId === card.id ? triggerText : null}
                          />
                        ))}
                    </div>

                    {/* Shop Overlay */}
                    {gameState === 'SHOP' && (
                        <div className="absolute inset-0 z-50 bg-[#2c2d33]/95 flex flex-col items-center justify-center rounded-2xl">
                             <h2 className="text-6xl font-black font-pixel text-yellow-500 mb-6 drop-shadow-md">SHOP</h2>
                             <div className="flex gap-4 mb-8">
                                 {shopJokers.map(j => (
                                     <div key={j.uid} className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => buyJoker(j)}>
                                         <Joker joker={j} />
                                         <div className={`px-4 py-1 rounded font-black font-pixel text-lg ${money >= j.cost ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'}`}>${j.cost}</div>
                                     </div>
                                 ))}
                             </div>
                             <button onClick={nextRound} className="px-12 py-3 bg-red-600 border-b-4 border-red-800 rounded-lg text-2xl font-black font-pixel uppercase shadow-lg hover:-translate-y-1 transition-all">Next Round</button>
                        </div>
                    )}
                    
                    {/* Message Overlay */}
                    {message && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                            <div className="bg-[#1a1a1a] border-y-8 border-red-500 px-12 py-6 shadow-2xl animate-pop">
                                <span className="text-6xl font-black font-pixel text-white tracking-widest">{message}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COL: STATS */}
                <div className="flex flex-col gap-2">
                    <div className="flex-1 bg-[#d97706] rounded-xl p-4 border-[3px] border-[#f59e0b] shadow-lg flex flex-col items-center justify-center">
                        <div className="text-xs font-bold font-pixel text-yellow-100 uppercase mb-1">Money</div>
                        <div className="text-5xl font-black font-pixel text-white drop-shadow-sm">${money}</div>
                    </div>
                    <div className="flex-1 bg-[#1e293b] rounded-xl p-4 border-[3px] border-[#475569] shadow-lg flex flex-col items-center justify-center">
                        <div className="text-xs font-bold font-pixel text-slate-400 uppercase mb-1">Ante</div>
                        <div className="text-4xl font-black font-pixel text-white mb-1">{ante}</div>
                        <div className="text-xs font-bold font-pixel text-slate-500 uppercase">{currentBlind.name}</div>
                    </div>
                </div>
            </div>

            {/* BOTTOM BAR: HAND & CONTROLS */}
            <div className="h-56 mt-2 flex flex-col justify-end">
                {gameState === 'PLAYING' && (
                    <div className="flex justify-center gap-4 mb-4">
                        <button 
                            onClick={playHand}
                            disabled={selectedCards.length === 0 || selectedCards.length > 5}
                            className={`
                                px-12 py-3 rounded-lg font-black font-pixel text-2xl uppercase tracking-wider border-b-4 transition-all
                                ${selectedCards.length > 0 && selectedCards.length <= 5 
                                    ? 'bg-[#fb923c] border-[#c2410c] text-white hover:-translate-y-1 shadow-lg' 
                                    : 'bg-gray-700 border-gray-900 text-gray-500 cursor-not-allowed'}
                            `}
                        >
                            Play Hand
                        </button>
                        <button 
                            onClick={discard}
                            disabled={selectedCards.length === 0 || discardsLeft <= 0}
                            className={`
                                px-8 py-3 rounded-lg font-black font-pixel text-2xl uppercase tracking-wider border-b-4 transition-all
                                ${selectedCards.length > 0 && discardsLeft > 0 
                                    ? 'bg-[#ef4444] border-[#991b1b] text-white hover:-translate-y-1 shadow-lg' 
                                    : 'bg-gray-700 border-gray-900 text-gray-500 cursor-not-allowed'}
                            `}
                        >
                            Discard
                        </button>
                    </div>
                )}
                
                {/* Hand Fan */}
                <div className="flex justify-center h-40 items-end pb-4 perspective-1000">
                    <div className="flex -space-x-8 px-4">
                        {hand.map((card, i) => (
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
      )}

      {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center">
             <h1 className="text-8xl font-black font-pixel text-red-600 mb-4 animate-pulse">GAME OVER</h1>
             <p className="text-3xl font-pixel text-white mb-8">Round {round + 1}</p>
             <button onClick={startGame} className="px-12 py-4 bg-white text-black font-black font-pixel text-2xl uppercase rounded hover:scale-105 transition-transform">
                New Run
             </button>
          </div>
      )}
    </div>
  );
}


