// Account Authentication & Legacy Preset Import Modal Controller
import type { AccountManager } from '../account/account-manager.ts';

export interface AccountModalOptions {
  accountManager: AccountManager;
  onAuthStateChanged: () => void;
  onPostLoginSave?: () => Promise<void>;
  getPendingAccountSave: () => boolean;
  setPendingAccountSave: (val: boolean) => void;
  getPendingAccountPublish: () => boolean;
  setPendingAccountPublish: (val: boolean) => void;
  executePendingSaveAndPublish: () => Promise<void>;
  executePendingSaveOnly: () => Promise<void>;
}

export class AccountModalController {
  private modal = document.getElementById('account-modal') as HTMLDivElement;
  private form = document.getElementById('account-form') as HTMLElement | null;
  private signedInBox = document.getElementById('account-signed-in') as HTMLElement | null;
  private title = document.getElementById('account-modal-title') as HTMLElement | null;
  private status = document.getElementById('account-status') as HTMLElement | null;
  private message = document.getElementById('account-message') as HTMLElement | null;
  private confirmWrap = document.getElementById('account-confirm-wrap') as HTMLElement | null;
  private submitBtn = document.getElementById('btn-account-submit') as HTMLButtonElement | null;
  private modeBtn = document.getElementById('btn-account-mode') as HTMLButtonElement | null;
  private userLabel = document.getElementById('account-user-label') as HTMLElement | null;
  private closeBtn = document.getElementById('btn-close-account') as HTMLButtonElement | null;
  private logoutBtn = document.getElementById('btn-account-logout') as HTMLButtonElement | null;
  private importBtn = document.getElementById('btn-import-legacy') as HTMLButtonElement | null;
  private importLibBtn = document.getElementById('btn-import-legacy-library') as HTMLButtonElement | null;

  private accountMode: 'login' | 'register' = 'login';

  constructor(private opts: AccountModalOptions) {
    this.bindEvents();
    this.renderState();
    this.initRestore();
  }

  private initRestore(): void {
    void this.opts.accountManager.restore().catch(error => {
      if (this.message) this.message.textContent = (error as Error).message;
    }).finally(() => {
      this.renderState();
      this.opts.onAuthStateChanged();
    });
  }

  private bindEvents(): void {
    const openAccount = () => {
      document.getElementById('mobile-preset-drawer')?.classList.remove('open');
      document.getElementById('mobile-drawer-backdrop')?.classList.remove('open');
      document.getElementById('mobile-drawer-backdrop')?.classList.add('hidden');
      this.open();
    };
    document.getElementById('btn-account')?.addEventListener('click', openAccount);
    document.getElementById('btn-account-mobile')?.addEventListener('click', openAccount);
    document.getElementById('btn-drawer-account')?.addEventListener('click', openAccount);
    document.getElementById('btn-preset-login')?.addEventListener('click', openAccount);
    document.getElementById('btn-library-account')?.addEventListener('click', openAccount);

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.hide());
    }

    if (this.modeBtn) {
      this.modeBtn.addEventListener('click', () => {
        this.accountMode = this.accountMode === 'login' ? 'register' : 'login';
        this.renderState();
      });
    }

    if (this.submitBtn) {
      this.submitBtn.addEventListener('click', () => { void this.submitForm(); });
    }

    for (const id of ['account-username', 'account-password', 'account-password-confirm']) {
      document.getElementById(id)?.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).key === 'Enter') void this.submitForm();
      });
    }

    if (this.logoutBtn) {
      this.logoutBtn.addEventListener('click', () => {
        this.opts.accountManager.logout();
        this.hide();
        this.opts.onAuthStateChanged();
      });
    }

    if (this.importBtn) {
      this.importBtn.addEventListener('click', () => { void this.importLegacyPresets(); });
    }
    if (this.importLibBtn) {
      this.importLibBtn.addEventListener('click', () => { void this.importLegacyPresets(); });
    }

    this.opts.accountManager.onChange(() => {
      this.renderState();
      this.opts.onAuthStateChanged();
    });
  }

  public open(mode: 'login' | 'register' = 'login'): void {
    this.accountMode = mode;
    this.modal.classList.remove('hidden');
    this.renderState();
  }

  public hide(): void {
    this.modal.classList.add('hidden');
  }

  public setMessage(msg: string): void {
    if (this.message) this.message.textContent = msg;
  }

  public renderState(): void {
    const user = this.opts.accountManager.user;
    if (this.form) this.form.classList.toggle('hidden', !!user);
    if (this.signedInBox) this.signedInBox.classList.toggle('hidden', !user);
    if (this.title) this.title.textContent = user ? 'Account' : (this.accountMode === 'login' ? 'Log in' : 'Create account');
    if (this.status) this.status.textContent = user ? 'Online sync active' : (this.accountMode === 'login' ? 'Connect for shared presets' : 'Join preset community');
    if (this.confirmWrap) this.confirmWrap.classList.toggle('hidden', this.accountMode !== 'register');
    if (this.submitBtn) this.submitBtn.textContent = this.accountMode === 'login' ? 'Sign in' : 'Create account';
    if (this.modeBtn) this.modeBtn.textContent = this.accountMode === 'login' ? 'Need an account? Register' : 'Already have an account? Log in';
    if (this.userLabel && user) this.userLabel.textContent = `${user.username} (${user.email || 'signed in'})`;

    const accountBtn = document.getElementById('btn-account');
    if (accountBtn) accountBtn.textContent = user ? user.username : 'Account';
    const mobileBtn = document.getElementById('btn-account-mobile') || document.getElementById('btn-drawer-account');
    if (mobileBtn) mobileBtn.textContent = user ? user.username : 'Log in';
    const libBtn = document.getElementById('btn-library-account');
    if (libBtn) libBtn.textContent = user ? `Signed in as ${user.username}` : 'Log in to sync';

    this.refreshLegacyImportButtons();
  }

  public refreshLegacyImportButtons(): void {
    const raw = localStorage.getItem('sonification_v2_user_presets');
    const presets = raw ? JSON.parse(raw) as unknown[] : [];
    const key = `sonification_v2_imported_${this.opts.accountManager.userId}`;
    const imported = this.opts.accountManager.userId ? localStorage.getItem(key) === 'true' : false;
    const shouldShow = !!this.opts.accountManager.userId && presets.length > 0 && !imported;

    if (this.importBtn) this.importBtn.classList.toggle('hidden', !shouldShow);
    if (this.importLibBtn) this.importLibBtn.classList.toggle('hidden', !shouldShow);
  }

  public async submitForm(): Promise<void> {
    const username = (document.getElementById('account-username') as HTMLInputElement).value;
    const password = (document.getElementById('account-password') as HTMLInputElement).value;
    const confirmPassword = (document.getElementById('account-password-confirm') as HTMLInputElement).value;
    if (this.message) this.message.textContent = '';
    try {
      if (this.accountMode === 'register') {
        if (!username || !password) throw new Error('Choose a username and password.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await this.opts.accountManager.register(username, password);
      }
      await this.opts.accountManager.login(username, password);
      this.renderState();
      this.hide();

      const saveAfterLogin = this.opts.getPendingAccountSave();
      const publishAfterSave = this.opts.getPendingAccountPublish();
      this.opts.setPendingAccountSave(false);
      this.opts.setPendingAccountPublish(false);

      if (saveAfterLogin && publishAfterSave) {
        await this.opts.executePendingSaveAndPublish();
      } else if (saveAfterLogin) {
        await this.opts.executePendingSaveOnly();
      }
    } catch (error) {
      if (this.message) this.message.textContent = (error as Error).message;
    }
  }

  public async importLegacyPresets(): Promise<void> {
    if (!this.opts.accountManager.userId) return this.open();
    const raw = localStorage.getItem('sonification_v2_user_presets');
    const key = `sonification_v2_imported_${this.opts.accountManager.userId}`;
    if (!raw) return;
    const pending = JSON.parse(raw) as any[];
    if (!pending.length) return;
    if (!confirm(`Import ${pending.length} presets from this browser into ${this.opts.accountManager.user?.username}'s account? The browser copy will be kept.`)) return;

    for (const rawPreset of pending) {
      const copy = JSON.parse(JSON.stringify(rawPreset));
      delete copy.id;
      await this.opts.accountManager.save(copy);
    }
    localStorage.setItem(key, 'true');
    this.refreshLegacyImportButtons();
    this.opts.onAuthStateChanged();
  }
}
