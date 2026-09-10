import { useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';
import './EmojiPicker.css';

export const EMOJI_GROUPS = [
  { name: 'Faces', items: [['😀','Grinning face'],['😃','Happy face'],['😁','Big smile'],['😂','Laughing face'],['🤣','Rolling laugh'],['😊','Smiling face'],['😎','Cool face'],['😍','Heart eyes'],['🥰','Loving face'],['😘','Kiss'],['😋','Yummy'],['😜','Wink tongue'],['🤩','Star eyes'],['🥳','Party face'],['🤔','Thinking'],['😴','Sleeping'],['😭','Crying'],['😱','Surprised'],['😇','Angel'],['🤗','Hug'],['🤫','Quiet'],['🙃','Upside down'],['🫠','Melting'],['🤖','Robot']] },
  { name: 'Gestures', items: [['👍','Thumbs up'],['👎','Thumbs down'],['👏','Clapping'],['🙌','Celebrating hands'],['👋','Wave'],['🤝','Handshake'],['🙏','Thank you'],['💪','Strong'],['✌️','Peace'],['🤞','Fingers crossed'],['👌','OK'],['🤟','Love you'],['🫶','Heart hands'],['👊','Fist bump'],['👉','Point right'],['👈','Point left']] },
  { name: 'Hearts', items: [['❤️','Heart'],['🧡','Orange heart'],['💛','Yellow heart'],['💚','Green heart'],['💙','Blue heart'],['💜','Purple heart'],['🖤','Black heart'],['🤍','White heart'],['💖','Sparkling heart'],['💕','Two hearts'],['💔','Broken heart'],['💯','Hundred']] },
  { name: 'Nature', items: [['🌟','Star'],['✨','Sparkles'],['🔥','Fire'],['🌈','Rainbow'],['☀️','Sun'],['🌙','Moon'],['❄️','Snowflake'],['⚡','Lightning'],['🌸','Blossom'],['🌻','Sunflower'],['🌴','Palm tree'],['🍀','Clover'],['🐶','Dog'],['🐱','Cat'],['🦊','Fox'],['🐼','Panda'],['🦋','Butterfly'],['🐝','Bee'],['🦄','Unicorn'],['🐬','Dolphin']] },
  { name: 'Food', items: [['🍕','Pizza'],['🍔','Burger'],['🍟','Fries'],['🍿','Popcorn'],['🍩','Donut'],['🍦','Ice cream'],['🎂','Birthday cake'],['🍓','Strawberry'],['🍉','Watermelon'],['🥑','Avocado'],['☕','Coffee'],['🧋','Bubble tea']] },
  { name: 'Fun', items: [['🎉','Celebration'],['🎊','Confetti'],['🎈','Balloon'],['🎁','Gift'],['🏆','Trophy'],['🥇','Gold medal'],['⚽','Football'],['🏀','Basketball'],['🎮','Gaming'],['🎲','Dice'],['🎸','Guitar'],['🎵','Music'],['🎤','Microphone'],['🎬','Movie'],['📸','Camera'],['🎨','Art']] },
  { name: 'Objects', items: [['🚀','Rocket'],['✈️','Airplane'],['🚗','Car'],['🏠','Home'],['💡','Idea'],['💎','Diamond'],['👑','Crown'],['💰','Money'],['📚','Books'],['💻','Laptop'],['📱','Phone'],['⏰','Alarm'],['✅','Check mark'],['❌','Cross mark'],['💬','Speech bubble'],['📍','Pin']] },
] as const;

export function EmojiPicker({ onSelect, label = 'Add emoji', disabled = false }: { onSelect: (emoji: string, name: string) => void; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const groups = EMOJI_GROUPS.filter((group) => category === 'All' || category === group.name).map((group) => ({ ...group, items: group.items.filter(([emoji, name]) => `${emoji} ${name} ${group.name}`.toLowerCase().includes(query.trim().toLowerCase())) })).filter((group) => group.items.length);
  return <>
    <button type="button" className="emoji-picker-launcher" disabled={disabled} aria-haspopup="dialog" onClick={() => { setQuery(''); setCategory('All'); setOpen(true); }}><Icon name="emoji" size={19} />{label}</button>
    {open && <Modal title="Choose an emoji" subtitle="Search or browse your favorites" icon="emoji" variant="dialog" onClose={() => setOpen(false)}>
      <div className="emoji-popup-body">
        <input className="emoji-search" type="search" aria-label="Search emojis" placeholder="Search emojis…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="emoji-categories" role="group" aria-label="Emoji categories">{['All', ...EMOJI_GROUPS.map((group) => group.name)].map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
        <div className="emoji-results">
          {groups.map((group) => <section key={group.name} aria-label={group.name}><h3>{group.name}</h3><div className="emoji-popup-grid">{group.items.map(([emoji, name]) => <button type="button" key={name} title={name} aria-label={`Choose ${name} emoji`} disabled={disabled} onClick={() => { setOpen(false); onSelect(emoji, name); }}>{emoji}</button>)}</div></section>)}
          {!groups.length && <p role="status" className="emoji-empty">No emojis found. Try “heart”, “party”, or “cat”.</p>}
        </div>
      </div>
    </Modal>}
  </>;
}
