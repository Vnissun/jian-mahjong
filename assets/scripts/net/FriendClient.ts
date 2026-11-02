export class FriendClient {
    state: any = null;
    code = '';
    token = '';
    onState?: (state: any) => void;
    onStatus?: (connected: boolean, message: string) => void;
    private stopped = true;
    private generation = 0;
    private pending = false;
    private offline = false;
    private pollAbort: AbortController | null = null;
    private suspended = false;
    private lifecycle = () => {
        if (document.hidden && !this.stopped) {
            this.suspended = true; this.stopped = true; this.generation++; this.pollAbort?.abort();
            this.notifyDisconnect();
        } else if (!document.hidden && this.suspended) {
            this.suspended = false;
            const generation = this.generation;
            void this.request('rooms/' + this.code + '/state').then(state => {
                if (generation === this.generation) this.begin(state);
            }).catch(() => { if (generation === this.generation) { this.stopped = false; void this.poll(++this.generation); } });
        }
    };
    private pageHide = () => { if (!this.stopped) this.notifyDisconnect(); };
    private notifyDisconnect(): void {
        if (!this.code || !this.token) return;
        // The identity goes in the POST body, never an invitation URL.
        const body = new Blob([JSON.stringify({token:this.token})], {type:'application/json'});
        navigator.sendBeacon?.('/api/rooms/' + this.code + '/disconnect', body);
    }
    private async request(path: string, body?: any, wait = false): Promise<any> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), wait ? 27000 : 12000);
        if (wait) this.pollAbort = controller;
        try {
            const res = await fetch('/api/' + path, { method: body === undefined ? 'GET' : 'POST',
                headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
                body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store' });
            const data = await res.json().catch(() => ({ error: '请从联机服务地址打开游戏' }));
            if (!res.ok) { const error: any = new Error(data.error || '连接失败'); error.status = res.status; throw error; }
            return data;
        } finally { clearTimeout(timeout); if (this.pollAbort === controller) this.pollAbort = null; }
    }
    async enter(name: string, config?: any, code?: string): Promise<void> {
        if (code && await this.resume(code)) return;
        this.stop(); this.token = ''; this.code = ''; this.state = null;
        const result = await this.request(code ? 'rooms/' + code + '/join' : 'rooms', code ? { name } : { name, config });
        this.code = result.state.code; this.token = result.token;
        sessionStorage.setItem('mahjong-room-' + this.code, this.token);
        localStorage.setItem('mahjong-room-' + this.code, this.token);
        localStorage.setItem('mahjong-last-room', this.code);
        this.begin(result.state);
    }
    async resume(code: string): Promise<boolean> {
        const token = localStorage.getItem('mahjong-room-' + code) || sessionStorage.getItem('mahjong-room-' + code);
        if (!token) return false;
        this.stop(); this.code = code; this.token = token;
        try { const state=await this.request('rooms/' + code + '/state');localStorage.setItem('mahjong-room-'+code,token);localStorage.setItem('mahjong-last-room',code);this.begin(state); return true; }
        catch (error: any) { if (error.status === 401 || error.status === 404) { sessionStorage.removeItem('mahjong-room-' + code); localStorage.removeItem('mahjong-room-' + code); if(localStorage.getItem('mahjong-last-room')===code)localStorage.removeItem('mahjong-last-room');this.token = ''; return false; } throw error; }
    }
    private begin(state: any): void { this.stopped = false; this.offline = false;document.addEventListener('visibilitychange',this.lifecycle);window.addEventListener('pagehide',this.pageHide);this.apply(state, true); this.onStatus?.(true, '已连接'); const generation = ++this.generation; void this.poll(generation); }
    private apply(state: any, force = false): void {
        if (this.state && state.revision < this.state.revision) return;
        const changed = force || !this.state || state.revision !== this.state.revision;
        state.serverNowOffset = (state.serverNow ?? Date.now()) - Date.now();
        this.state = state; if (changed) this.onState?.(state);
    }
    private async poll(generation: number): Promise<void> {
        while (!this.stopped && generation === this.generation) {
            try {
                const state = await this.request('rooms/' + this.code + '/state?wait=1&since=' + this.state.revision, undefined, true);
                if (this.stopped || generation !== this.generation) return;
                const recovered = this.offline; this.offline = false;
                this.onStatus?.(true, '已连接'); this.apply(state, recovered);
            } catch (error: any) {
                if (this.stopped || generation !== this.generation) return;
                this.offline = true;
                this.onStatus?.(false, error.status === 401 || error.status === 404 ? error.message : '连接中断，正在自动重连…');
                if (error.status === 401 || error.status === 404) { this.stop(); return; }
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }
    async action(type: string, payload: any = {}): Promise<void> {
        if (this.pending || this.stopped) return;
        this.pending = true;
        const generation=this.generation;
        try { const state=await this.request('rooms/' + this.code + '/action', { ...payload, type, revision: this.state.revision, requestId: globalThis.crypto?.randomUUID?.() ?? Date.now() + '-' + Math.random() });if(!this.stopped&&generation===this.generation)this.apply(state,true); }
        catch (error: any) { if(this.stopped||generation!==this.generation)return;this.onStatus?.(false, error.message || '操作未完成'); try { const state=await this.request('rooms/' + this.code + '/state');if(!this.stopped&&generation===this.generation)this.apply(state,true); } catch {} }
        finally { this.pending = false; }
    }
    async leave(): Promise<void> { const code = this.code,keepIdentity=this.state?.phase!=='waiting'; this.stop(); try { await this.request('rooms/' + code + '/leave', {}); } catch {} if(!keepIdentity){sessionStorage.removeItem('mahjong-room-' + code);localStorage.removeItem('mahjong-room-' + code);}if(localStorage.getItem('mahjong-last-room')===code)localStorage.removeItem('mahjong-last-room'); }
    stop(): void { this.stopped = true; this.suspended=false;this.generation++; this.pollAbort?.abort();document.removeEventListener('visibilitychange',this.lifecycle);window.removeEventListener('pagehide',this.pageHide); }
}
