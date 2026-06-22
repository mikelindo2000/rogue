export class GameModal extends HTMLElement {
  private rendered = false;

  static get observedAttributes() {
    return ['open'];
  }

  constructor() {
    super();
  }

  connectedCallback() {
    if (this.rendered) return;
    this.rendered = true;

    const title = this.getAttribute('title') || '';
    const contentHtml = this.innerHTML;

    this.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-window">
          <div class="modal-header">
            <h3 class="modal-title">${title}</h3>
            <button class="modal-close-btn" aria-label="Close modal">&times;</button>
          </div>
          <div class="modal-body">
            ${contentHtml}
          </div>
        </div>
      </div>
    `;

    // Initialize display state based on attribute presence
    this.style.display = this.hasAttribute('open') ? 'flex' : 'none';

    // Attach click listeners for closing
    const closeBtn = this.querySelector('.modal-close-btn');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    
    const backdrop = this.querySelector('.modal-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.close();
      }
    });
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === 'open') {
      const isOpen = newValue !== null;
      this.style.display = isOpen ? 'flex' : 'none';
      
      // Dispatch an event to allow parent containers/engine to pause/resume game actions
      this.dispatchEvent(new CustomEvent('modal-state-change', {
        bubbles: true,
        detail: { open: isOpen, modal: this }
      }));
    }
  }

  public open() {
    this.setAttribute('open', '');
  }

  public close() {
    this.removeAttribute('open');
  }
}

if (!customElements.get('game-modal')) {
  customElements.define('game-modal', GameModal);
}
