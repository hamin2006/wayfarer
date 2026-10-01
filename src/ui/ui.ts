import * as THREE from 'three';
import './ui.css';
import { PERKS, type PerkId } from '../combat/perks';
import { BUFFS, computeStats, type Stats } from '../combat/stats';
import type { Enemy } from '../entities/enemy';
import type { Ability, Player } from '../entities/player';
import { RARITIES, WEAPONS, itemScore, salvageValue, statLines, type Item, type Slot } from '../loot/items';

type Handler = () => void;

const ICON: Record<string, string> = {
  sword: '🗡️',
  axe: '🪓',
  hammer: '🔨',
  dagger: '🔪',
  armor: '🛡️',
  trinket: '💍',
};
export const itemIcon = (it: Item) => ICON[it.weapon ?? it.slot];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Rough damage per second of the basic attack, for comparing weapons. */
export function dps(s: Stats) {
  const w = WEAPONS[s.weapon];
  return (s.power * s.damageMult * w.dmg * s.atkSpeed * (1 + Math.min(s.crit, 1) * (s.critDmg - 1))) / w.interval;
}

export class UI {
  onAbility: (a: Ability | 'recall') => void = () => {};
  onPerk: (id: PerkId) => void = () => {};
  onEquip: (item: Item) => void = () => {};
  onSalvage: (items: Item[]) => void = () => {};
  onRespawn: Handler = () => {};
  onResume: Handler = () => {};
  onNewWorld: Handler = () => {};
  onMute: Handler = () => {};
  onBegin: Handler = () => {};
  onModalChange: (open: boolean) => void = () => {};

  private player!: Player;
  private hpFill = el('div', 'fill');
  private hpGhost = el('div', 'ghost');
  private hpText = el('span');
  private xpFill = el('div', 'fill');
  private lvl = el('div', 'lvl');
  private buffs = el('div', 'buffs');
  private region = el('div', 'region');
  private danger = el('div', 'danger');
  private gold = el('div', 'gold');
  private abilityBtns = new Map<string, HTMLButtonElement>();
  private bossBarEl = el('div', 'boss-bar hidden');
  private toasts = el('div', 'toasts');
  private announceEl = el('div', 'announce');
  private vignette = el('div', 'vignette');
  private labels = el('div', 'labels');
  private modal = el('div', 'modal hidden');
  private recallBar = el('div', 'recall-bar hidden', '<div class="fill"></div><span>Returning home…</span>');
  private modalKind: 'perk' | 'bag' | 'death' | 'pause' | 'welcome' | null = null;
  private selected: Item | null = null;
  private perkChoices: PerkId[] = [];
  private announceTimer = 0;
  private ghostHp = 1;
  private last = { region: '', gold: -1, level: -1, hpText: '', buffs: '' };
  private labelEls: HTMLDivElement[] = [];
  private v = new THREE.Vector3();
  readonly hudTopRight = el('div', 'hud-tr');
  muted = false;

  constructor() {
    const tl = el('div', 'hud-tl');
    const bars = el('div', 'bars');
    const hp = el('div', 'hpbar');
    hp.append(this.hpGhost, this.hpFill, this.hpText);
    const xp = el('div', 'xpbar');
    xp.append(this.xpFill);
    bars.append(hp, xp, this.buffs);
    tl.append(this.lvl, bars);

    const btnRow = el('div', 'hud-btns');
    const bag = el('button', 'round-btn', '🎒');
    bag.title = 'Bag (B)';
    bag.onclick = () => this.toggleBag();
    const menu = el('button', 'round-btn', '☰');
    menu.title = 'Menu (Esc)';
    menu.onclick = () => this.showPause();
    btnRow.append(bag, menu);
    const info = el('div', 'hud-info');
    info.append(this.region, this.danger, this.gold);
    this.hudTopRight.append(btnRow, info);

    const abilities = el('div', 'abilities');
    const defs: [Ability | 'recall', string, string, string][] = [
      ['recall', '🏠', 'H', 'Recall home'],
      ['bolt', '✨', 'E', 'Arcane Bolt — click / E'],
      ['spin', '🌀', 'Q', 'Whirlwind — Q'],
      ['dash', '💨', '␣', 'Dash — Space / right-click'],
    ];
    for (const [id, icon, key, title] of defs) {
      const b = el('button', `ability ${id}`, `<span class="ic">${icon}</span><span class="key">${key}</span>`);
      b.title = title;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onAbility(id);
      });
      abilities.append(b);
      this.abilityBtns.set(id, b);
    }

    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal && (this.modalKind === 'bag' || this.modalKind === 'pause')) this.closeModal();
    });

    document.body.append(tl, this.hudTopRight, abilities, this.bossBarEl, this.toasts, this.announceEl, this.vignette, this.labels, this.recallBar, this.modal);
  }

  setPlayer(p: Player) {
    this.player = p;
  }

  get modalOpen() {
    return this.modalKind !== null;
  }

  // ---------- HUD ----------

  update(dt: number, region: string, enemyLevel: number) {
    const p = this.player;
    const hpRatio = Math.max(0, p.hp / p.stats.maxHp);
    this.hpFill.style.width = `${hpRatio * 100}%`;
    this.ghostHp = Math.max(hpRatio, this.ghostHp - dt * 0.6);
    this.hpGhost.style.width = `${this.ghostHp * 100}%`;
    this.hpFill.classList.toggle('low', hpRatio < 0.3);
    const hpText = `${Math.ceil(p.hp)} / ${p.stats.maxHp}`;
    if (hpText !== this.last.hpText) this.hpText.textContent = this.last.hpText = hpText;
    this.xpFill.style.width = `${Math.min(1, p.xp / p.xpNeeded) * 100}%`;
    if (p.level !== this.last.level) this.lvl.textContent = String((this.last.level = p.level));
    if (p.gold !== this.last.gold) this.gold.textContent = `🪙 ${(this.last.gold = p.gold).toLocaleString()}`;
    if (region !== this.last.region) {
      if (this.last.region) this.announce(region, '', 2200, 'region');
      this.region.textContent = this.last.region = region;
    }
    const diff = enemyLevel - p.level;
    this.danger.textContent = `Foes Lv ${enemyLevel}`;
    this.danger.className = `danger ${diff >= 4 ? 'deadly' : diff >= 2 ? 'hard' : diff <= -3 ? 'easy' : ''}`;

    const buffKey = p.buffs.map((b) => `${b.kind}${Math.ceil(b.t)}`).join();
    if (buffKey !== this.last.buffs) {
      this.last.buffs = buffKey;
      this.buffs.innerHTML = p.buffs
        .map((b) => `<span class="buff" title="${BUFFS[b.kind].name}: ${BUFFS[b.kind].desc}">${BUFFS[b.kind].icon}<small>${Math.ceil(b.t)}</small></span>`)
        .join('');
    }

    for (const a of ['dash', 'spin', 'bolt'] as Ability[]) {
      const b = this.abilityBtns.get(a)!;
      const frac = Math.max(0, p.cd[a] / p.cooldown(a));
      b.style.setProperty('--cd', String(frac));
      b.classList.toggle('ready', frac <= 0);
    }
    this.recallBar.classList.toggle('hidden', p.recall < 0);
    if (p.recall >= 0) (this.recallBar.firstElementChild as HTMLElement).style.width = `${Math.min(1, p.recall / 2.5) * 100}%`;

    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0) this.announceEl.classList.remove('show');
    }
  }

  setTouchHints(touch: boolean) {
    document.body.classList.toggle('touch', touch);
  }

  hurtFlash() {
    this.vignette.classList.remove('hit');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('hit');
  }

  setLowHealth(low: boolean) {
    this.vignette.classList.toggle('low', low);
  }

  toast(text: string, kind = '') {
    const t = el('div', `toast ${kind}`, text);
    this.toasts.prepend(t);
    while (this.toasts.children.length > 5) this.toasts.lastElementChild!.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  itemToast(item: Item, equipped: boolean) {
    const r = RARITIES[item.rarity];
    const better = !equipped && itemScore(item) > itemScore(this.player.equipped[item.slot]);
    this.toast(
      `<span class="ti">${itemIcon(item)}</span><span style="color:${r.color}">${esc(item.name)}</span>${equipped ? ' <em>equipped</em>' : better ? ' <em class="up">▲ upgrade</em>' : ''}`,
      `item r${item.rarity}`,
    );
  }

  announce(title: string, sub = '', ms = 2200, kind = '') {
    this.announceEl.className = `announce show ${kind}`;
    this.announceEl.innerHTML = `<div class="a-title">${esc(title)}</div>${sub ? `<div class="a-sub">${sub}</div>` : ''}`;
    this.announceTimer = ms / 1000;
  }

  bossBar(e: Enemy | null) {
    this.bossBarEl.classList.toggle('hidden', !e);
    if (!e) return;
    this.bossBarEl.innerHTML = `<div class="name">${esc(e.name)} <small>Lv ${e.level}</small></div><div class="track"><div class="fill" style="width:${(Math.max(0, e.hp) / e.maxHp) * 100}%"></div></div>`;
  }

  /** Floating names over elites and bosses. */
  setLabels(camera: THREE.Camera, list: { pos: THREE.Vector3; text: string; color: string }[]) {
    while (this.labelEls.length < list.length) {
      const d = el('div', 'label');
      this.labels.append(d);
      this.labelEls.push(d);
    }
    this.labelEls.forEach((d, k) => {
      const it = list[k];
      if (!it) {
        d.style.display = 'none';
        return;
      }
      this.v.copy(it.pos).project(camera);
      if (this.v.z > 1) {
        d.style.display = 'none';
        return;
      }
      d.style.display = 'block';
      if (d.textContent !== it.text) d.textContent = it.text;
      d.style.color = it.color;
      d.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * window.innerWidth}px, ${(-this.v.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -100%)`;
    });
  }

  // ---------- Modals ----------

  private openModal(kind: NonNullable<UI['modalKind']>, html: string) {
    this.modalKind = kind;
    this.modal.className = `modal ${kind}`;
    this.modal.innerHTML = html;
    this.onModalChange(true);
  }

  closeModal() {
    if (!this.modalKind) return;
    this.modalKind = null;
    this.modal.className = 'modal hidden';
    this.modal.innerHTML = '';
    this.selected = null;
    this.onModalChange(false);
  }

  handleKey(k: string): boolean {
    if (this.modalKind === 'perk' && ['1', '2', '3'].includes(k)) {
      const id = this.perkChoices[Number(k) - 1];
      if (id) this.pickPerk(id);
      return true;
    }
    if (k === 'escape' && this.modalKind && this.modalKind !== 'perk' && this.modalKind !== 'death') {
      this.closeModal();
      return true;
    }
    if ((k === 'b' || k === 'i' || k === 'tab') && (this.modalKind === 'bag' || !this.modalKind)) {
      this.toggleBag();
      return true;
    }
    if ((k === 'enter' || k === ' ') && this.modalKind === 'welcome') {
      this.closeModal();
      this.onBegin();
      return true;
    }
    return !!this.modalKind;
  }

  showWelcome() {
    this.openModal(
      'welcome',
      `<div class="panel">
        <div class="logo">⚔️</div>
        <h1>Wayfarer</h1>
        <p class="lead">You wake in <b>Hearthvale</b>, a quiet village at the centre of an endless world. The further you wander, the wilder it gets — and the better the loot.</p>
        <div class="controls">
          <div><kbd>WASD</kbd> move <span class="t">· drag the left of the screen</span></div>
          <div><b>Auto-attack</b> anything in reach</div>
          <div><kbd>Click</kbd>/<kbd>E</kbd> Arcane Bolt · <kbd>Q</kbd> Whirlwind · <kbd>Space</kbd> Dash</div>
          <div><kbd>B</kbd> bag · <kbd>H</kbd> recall home · red circles mean <b>dodge!</b></div>
        </div>
        <button class="btn primary" data-act="begin">Begin your journey</button>
      </div>`,
    );
    this.modal.querySelector<HTMLElement>('[data-act=begin]')!.onclick = () => {
      this.closeModal();
      this.onBegin();
    };
  }

  showPerks(choices: PerkId[], level: number) {
    this.perkChoices = choices;
    const owned = this.player.perks;
    this.openModal(
      'perk',
      `<div class="perk-wrap">
        <div class="perk-title">Level ${level}!</div>
        <div class="perk-sub">Choose a blessing</div>
        <div class="perk-cards">${choices
          .map(
            (id, k) => `<button class="perk-card" data-id="${id}">
              <span class="pk-key">${k + 1}</span>
              <span class="pk-icon">${PERKS[id].icon}</span>
              <span class="pk-name">${PERKS[id].name}</span>
              <span class="pk-desc">${PERKS[id].desc}</span>
              <span class="pk-stack">${owned[id] ?? 0} / ${PERKS[id].max}</span>
            </button>`,
          )
          .join('')}</div>
      </div>`,
    );
    this.modal.querySelectorAll<HTMLElement>('.perk-card').forEach((b) => (b.onclick = () => this.pickPerk(b.dataset.id as PerkId)));
  }

  private pickPerk(id: PerkId) {
    this.closeModal();
    this.onPerk(id);
  }

  showDeath(goldLost: number) {
    this.openModal(
      'death',
      `<div class="panel small">
        <div class="logo">💀</div>
        <h2>You fell</h2>
        <p class="lead">${goldLost > 0 ? `Dropped ${goldLost} gold on the way home.` : 'Dust yourself off.'}</p>
        <button class="btn primary" data-act="respawn">Return to Hearthvale</button>
      </div>`,
    );
    this.modal.querySelector<HTMLElement>('[data-act=respawn]')!.onclick = () => {
      this.closeModal();
      this.onRespawn();
    };
  }

  showPause(stats?: { kills: number; bosses: number; deaths: number; farthest: number }) {
    if (this.modalKind) return;
    const s = stats ?? this.pauseStats;
    this.openModal(
      'pause',
      `<div class="panel small">
        <h2>Paused</h2>
        <div class="stat-grid">
          <div><b>${s.kills}</b><span>monsters</span></div>
          <div><b>${s.bosses}</b><span>bosses</span></div>
          <div><b>${s.farthest}</b><span>furthest ring</span></div>
        </div>
        <button class="btn primary" data-act="resume">Resume</button>
        <button class="btn" data-act="mute">${this.muted ? '🔇 Sound off' : '🔊 Sound on'}</button>
        <button class="btn danger" data-act="new">New world…</button>
        <p class="hint-small">Progress saves automatically.</p>
      </div>`,
    );
    const q = (a: string) => this.modal.querySelector<HTMLElement>(`[data-act=${a}]`)!;
    q('resume').onclick = () => {
      this.closeModal();
      this.onResume();
    };
    q('mute').onclick = () => {
      this.onMute();
      q('mute').textContent = this.muted ? '🔇 Sound off' : '🔊 Sound on';
    };
    q('new').onclick = () => {
      const b = q('new');
      if (b.dataset.confirm) {
        this.closeModal();
        this.onNewWorld();
      } else {
        b.dataset.confirm = '1';
        b.textContent = 'Really? This erases your hero. Tap again';
      }
    };
  }

  pauseStats = { kills: 0, bosses: 0, deaths: 0, farthest: 0 };

  // ---------- Bag ----------

  toggleBag() {
    if (this.modalKind === 'bag') this.closeModal();
    else if (!this.modalKind) {
      this.openModal('bag', '<div class="panel bag-panel"></div>');
      this.refreshBag();
    }
  }

  refreshBag() {
    if (this.modalKind !== 'bag') return;
    const p = this.player;
    const panel = this.modal.querySelector('.bag-panel')!;
    const sel = this.selected && (p.bag.includes(this.selected) || Object.values(p.equipped).includes(this.selected)) ? this.selected : null;
    this.selected = sel;

    const tile = (it: Item | null, label: string, equipped: boolean) => {
      if (!it) return `<div class="tile empty"><span class="slot-label">${label}</span></div>`;
      const up = !equipped && itemScore(it) > itemScore(p.equipped[it.slot]);
      return `<button class="tile r${it.rarity} ${it === sel ? 'sel' : ''}" data-id="${it.id}" style="--rc:${RARITIES[it.rarity].color}">
        <span class="ti">${itemIcon(it)}</span>${up ? '<span class="up">▲</span>' : ''}<span class="il">${it.ilvl}</span></button>`;
    };
    const slots: Slot[] = ['weapon', 'armor', 'trinket'];
    const worse = p.bag.filter((it) => itemScore(it) <= itemScore(p.equipped[it.slot]));
    const s = p.stats;
    panel.innerHTML = `
      <div class="bag-head"><h2>Bag</h2><span class="gold-pill">🪙 ${p.gold.toLocaleString()}</span><button class="x" data-act="close">✕</button></div>
      <div class="bag-body">
        <div class="col">
          <div class="equipped">${slots.map((sl) => tile(p.equipped[sl], sl, true)).join('')}</div>
          <div class="char-stats">
            <div><span>DPS</span><b>${Math.round(dps(s))}</b></div>
            <div><span>Power</span><b>${Math.round(s.power * s.damageMult)}</b></div>
            <div><span>Health</span><b>${s.maxHp}</b></div>
            <div><span>Armor</span><b>${Math.round(s.armor)}</b></div>
            <div><span>Crit</span><b>${Math.round(s.crit * 100)}%</b></div>
            <div><span>Speed</span><b>${s.moveSpeed.toFixed(1)}</b></div>
          </div>
          <div class="grid">${Array.from({ length: 20 }, (_, k) => tile(p.bag[k] ?? null, '', false)).join('')}</div>
          <button class="btn small" data-act="junk" ${worse.length ? '' : 'disabled'}>Salvage ${worse.length} weaker item${worse.length === 1 ? '' : 's'} (+${worse.reduce((a, it) => a + salvageValue(it), 0)}g)</button>
        </div>
        <div class="details">${sel ? this.details(sel) : '<p class="muted">Tap an item to inspect it.<br/><br/>▲ marks upgrades.</p>'}</div>
      </div>`;
    panel.querySelector<HTMLElement>('[data-act=close]')!.onclick = () => this.closeModal();
    panel.querySelector<HTMLElement>('[data-act=junk]')!.onclick = () => {
      this.onSalvage(worse);
      this.refreshBag();
    };
    panel.querySelectorAll<HTMLElement>('.tile[data-id]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id;
        this.selected = [...p.bag, ...Object.values(p.equipped)].find((it) => it?.id === id) ?? null;
        this.refreshBag();
      };
    });
    const eq = panel.querySelector<HTMLElement>('[data-act=equip]');
    if (eq && sel) eq.onclick = () => {
      this.onEquip(sel);
      this.refreshBag();
    };
    const sv = panel.querySelector<HTMLElement>('[data-act=salvage]');
    if (sv && sel) sv.onclick = () => {
      this.onSalvage([sel]);
      this.selected = null;
      this.refreshBag();
    };
  }

  private details(it: Item) {
    const p = this.player;
    const r = RARITIES[it.rarity];
    const equipped = Object.values(p.equipped).includes(it);
    const type = it.weapon ? `${it.weapon[0].toUpperCase()}${it.weapon.slice(1)}` : it.slot === 'armor' ? 'Armor' : 'Trinket';
    let compare = '';
    if (!equipped) {
      // Stats with this item swapped in vs. current.
      const gear = { ...p.equipped, [it.slot]: it };
      const now = p.stats;
      const after = computeStats(p.level, Object.values(gear), p.perks, p.buffs.map((b) => b.kind));
      const rows: [string, number, number, (v: number) => string][] = [
        ['DPS', dps(now), dps(after), (v) => String(Math.round(v))],
        ['Health', now.maxHp, after.maxHp, (v) => String(Math.round(v))],
        ['Armor', now.armor, after.armor, (v) => String(Math.round(v))],
        ['Crit', now.crit, after.crit, (v) => `${Math.round(v * 100)}%`],
        ['Speed', now.moveSpeed, after.moveSpeed, (v) => v.toFixed(1)],
        ['Life steal', now.lifesteal, after.lifesteal, (v) => `${Math.round(v * 100)}%`],
      ];
      const lines = rows
        .filter(([, a, b]) => Math.abs(a - b) > 0.004)
        .map(([name, a, b, f]) => `<div class="cmp ${b > a ? 'up' : 'down'}"><span>${name}</span><span>${f(a)} → <b>${f(b)}</b></span></div>`)
        .join('');
      compare = `<div class="compare"><div class="cmp-title">If equipped</div>${lines || '<div class="muted">No change</div>'}</div>`;
    }
    const w = it.weapon ? WEAPONS[it.weapon] : null;
    return `
      <div class="d-name" style="color:${r.color}">${itemIcon(it)} ${esc(it.name)}</div>
      <div class="d-meta">${r.name} ${type} · item level ${it.ilvl}${w ? ` · ${(1 / w.interval).toFixed(1)} hits/s` : ''}</div>
      <ul class="d-stats">${statLines(it).map((l) => `<li>${l}</li>`).join('')}</ul>
      ${compare}
      <div class="d-actions">
        ${equipped ? '<span class="muted">Equipped</span>' : `<button class="btn primary small" data-act="equip">Equip</button><button class="btn small" data-act="salvage">Salvage +${salvageValue(it)}g</button>`}
      </div>`;
  }
}
