import { MONSTER_DATABASE } from '../config';
import './game-modal';
import { GameModal } from './game-modal';

export class MonsterCompendium extends HTMLElement {
  private rendered = false;
  private modal: GameModal | null = null;

  constructor() {
    super();
  }

  connectedCallback() {
    if (this.rendered) return;
    this.rendered = true;

    this.innerHTML = `
      <game-modal id="compendium-modal" title="Monsters Compendium">
        <div class="compendium-search-container">
          <input type="text" id="compendium-search" placeholder="Search codex by name or symbol..." autocomplete="off" />
        </div>
        <div class="compendium-content">
          <div class="compendium-grid">
            ${MONSTER_DATABASE.map(monster => {
              const isBoss = monster.special === 'boss';
              const cardClass = isBoss ? 'monster-card boss-card' : 'monster-card';
              return `
                <div class="${cardClass}" data-name="${monster.name.toLowerCase()}" data-symbol="${monster.symbol.toLowerCase()}">
                  <div class="monster-symbol-wrapper" style="color: ${monster.color};">
                    <span class="monster-symbol">${monster.symbol}</span>
                  </div>
                  <div class="monster-details">
                    <h4 class="monster-name">${monster.name} ${isBoss ? '<span class="boss-tag">BOSS</span>' : ''}</h4>
                    <div class="monster-stats">
                      <div class="stat-row">
                        <span class="stat-label">HP:</span>
                        <span class="stat-val">${monster.hp}</span>
                      </div>
                      <div class="stat-row">
                        <span class="stat-label">ATK:</span>
                        <span class="stat-val">${monster.atk}</span>
                      </div>
                      <div class="stat-row">
                        <span class="stat-label">Spawn Floor:</span>
                        <span class="stat-val">${monster.minFloor}+</span>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </game-modal>
    `;

    this.modal = this.querySelector('#compendium-modal') as GameModal;

    // Hook search functionality
    const searchInput = this.querySelector('#compendium-search') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      const cards = this.querySelectorAll('.monster-card');
      
      cards.forEach(cardNode => {
        const card = cardNode as HTMLElement;
        const name = card.getAttribute('data-name') || '';
        const symbol = card.getAttribute('data-symbol') || '';
        if (name.includes(query) || symbol.includes(query)) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }

  public open() {
    if (this.modal) {
      this.modal.open();
      // Focus search input after modal transition
      setTimeout(() => {
        const searchInput = this.querySelector('#compendium-search') as HTMLInputElement;
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
          // Trigger input event to clear previous filters
          searchInput.dispatchEvent(new Event('input'));
        }
      }, 50);
    }
  }

  public close() {
    if (this.modal) {
      this.modal.close();
    }
  }

  public toggle() {
    if (this.modal) {
      if (this.modal.hasAttribute('open')) {
        this.close();
      } else {
        this.open();
      }
    }
  }
}

if (!customElements.get('monster-compendium')) {
  customElements.define('monster-compendium', MonsterCompendium);
}
