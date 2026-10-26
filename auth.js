// Login screen for the dashboard and the weekly report. Loaded in <head>, it
// keeps the page hidden until the server confirms who is signed in; the page
// then calls dashAuth.ready() before it starts reading sheets. The real lock
// is on the server: /api/sheet-data answers 401 to anyone without a session.
(function(){
  'use strict';
  const root = document.documentElement;
  root.classList.add('auth-pending');

  const css = `
  html.auth-pending .wrap, html.auth-locked .wrap{display:none !important;}
  #authScreen{
    min-height:100vh;display:flex;align-items:center;justify-content:center;
    padding:24px 16px;box-sizing:border-box;font-family:var(--font-ui, system-ui, sans-serif);
  }
  .auth-card{
    width:100%;max-width:380px;background:var(--surface,#fff);border:1px solid var(--border,#EAE3D5);
    border-radius:24px;padding:32px 28px 26px;box-shadow:var(--shadow-card, 0 14px 30px -22px rgba(58,46,24,.26));
  }
  .auth-head{display:flex;align-items:center;gap:12px;margin-bottom:6px;}
  .auth-mark{
    width:40px;height:40px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#FFFFFF,#F7F1E4);border:1px solid #E7DECB;color:var(--text,#15171C);
  }
  .auth-mark svg{width:18px;height:18px;}
  .auth-title{font-size:19px;font-weight:800;color:var(--text,#15171C);letter-spacing:-0.01em;}
  .auth-sub{font-size:12.5px;color:var(--text-muted,#5E6270);margin:0 0 22px;}
  .auth-field{display:block;margin-bottom:14px;}
  .auth-field span{display:block;font-size:12px;font-weight:600;color:var(--text-muted,#5E6270);margin-bottom:6px;}
  .auth-field input{
    width:100%;box-sizing:border-box;padding:11px 14px;border-radius:12px;font-size:14px;
    border:1px solid var(--border,#EAE3D5);background:var(--surface-2,#FAF7F0);color:var(--text,#15171C);
    font-family:inherit;direction:ltr;text-align:left;
  }
  .auth-field input:focus{outline:none;border-color:var(--text,#15171C);background:#fff;box-shadow:0 0 0 3px rgba(21,23,28,.08);}
  .auth-btn{
    width:100%;margin-top:6px;padding:12px;border:none;border-radius:12px;cursor:pointer;
    background:var(--text,#15171C);color:#fff;font-family:inherit;font-size:14px;font-weight:700;
    transition:opacity .15s;
  }
  .auth-btn:disabled{opacity:.6;cursor:default;}
  .auth-msg{min-height:20px;margin-top:12px;font-size:12.5px;color:var(--negative,#C62026);text-align:center;}
  .auth-user{
    display:flex;align-items:center;gap:8px;background:var(--surface,#fff);border:1px solid var(--border,#EAE3D5);
    border-radius:999px;padding:5px 6px 5px 12px;font-size:12px;color:var(--text-muted,#5E6270);white-space:nowrap;
  }
  .auth-user b{color:var(--text,#15171C);font-weight:700;}
  .auth-out{
    border:none;background:var(--surface-3,#F2ECE1);color:var(--text,#15171C);border-radius:999px;
    padding:4px 10px;font-family:inherit;font-size:11.5px;font-weight:600;cursor:pointer;
  }
  .auth-out:hover{background:var(--border,#EAE3D5);}
  @media (max-width:640px){ .auth-user b{display:none;} .auth-user{padding:4px;} }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const MARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/></svg>';
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  async function whoAmI(){
    try{
      const res = await fetch('/api/me', {cache:'no-store', credentials:'same-origin'});
      if(res.ok) return {user: (await res.json()).user};
      return {user: null, notConfigured: res.status === 503};
    }catch(e){
      return {user: null, offline: true};
    }
  }

  function bodyReady(){
    return document.body ? Promise.resolve() : new Promise(r => document.addEventListener('DOMContentLoaded', r, {once:true}));
  }

  // Resolves once someone has signed in on this screen.
  function showLogin(state){
    return new Promise(resolve=>{
      root.classList.remove('auth-pending');
      root.classList.add('auth-locked');
      const title = document.title || 'Management Dashboard';
      const box = document.createElement('div');
      box.id = 'authScreen';
      box.innerHTML = `
        <form class="auth-card" novalidate>
          <div class="auth-head"><div class="auth-mark">${MARK}</div><div class="auth-title">${esc(title)}</div></div>
          <p class="auth-sub">برای دیدن داشبورد وارد شو.</p>
          <label class="auth-field"><span>نام کاربری</span>
            <input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
          <label class="auth-field"><span>رمز عبور</span>
            <input name="password" type="password" autocomplete="current-password" required></label>
          <button class="auth-btn" type="submit">ورود</button>
          <div class="auth-msg" role="alert"></div>
        </form>`;
      document.body.prepend(box);
      const form = box.querySelector('form');
      const msg = box.querySelector('.auth-msg');
      const btn = box.querySelector('.auth-btn');
      if(state && state.notConfigured){
        msg.textContent = 'ورود هنوز روی سرور تنظیم نشده (DASHBOARD_USERS در Vercel).';
      }else if(state && state.offline){
        msg.textContent = 'به سرور وصل نشد — اینترنت رو چک کن و صفحه رو رفرش کن.';
      }
      form.username.focus();
      form.addEventListener('submit', async e=>{
        e.preventDefault();
        const username = form.username.value.trim(), password = form.password.value;
        if(!username || !password){ msg.textContent = 'نام کاربری و رمز عبور رو وارد کن.'; return; }
        btn.disabled = true; btn.textContent = 'در حال ورود…'; msg.textContent = '';
        try{
          const res = await fetch('/api/login', {
            method:'POST', credentials:'same-origin', cache:'no-store',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username, password})
          });
          if(res.ok){
            const user = (await res.json()).user;
            box.remove();
            root.classList.remove('auth-locked');
            resolve(user);
            return;
          }
          msg.textContent = res.status === 401 ? 'نام کاربری یا رمز عبور اشتباهه.'
                          : res.status === 503 ? 'ورود هنوز روی سرور تنظیم نشده (DASHBOARD_USERS در Vercel).'
                          : 'ورود انجام نشد — دوباره امتحان کن.';
          form.password.select();
        }catch(err){
          msg.textContent = 'به سرور وصل نشد — دوباره امتحان کن.';
        }
        btn.disabled = false; btn.textContent = 'ورود';
      });
    });
  }

  // Name and a logout button beside the sync status.
  function mountUserChip(user){
    const slot = document.querySelector('.topbar-right');
    if(!slot || document.getElementById('authUser')) return;
    const chip = document.createElement('div');
    chip.className = 'auth-user';
    chip.id = 'authUser';
    chip.innerHTML = `<b>${esc(user)}</b><button type="button" class="auth-out">خروج</button>`;
    chip.querySelector('.auth-out').addEventListener('click', async ()=>{
      try{ await fetch('/api/logout', {method:'POST', credentials:'same-origin', cache:'no-store'}); }catch(e){}
      location.reload();
    });
    slot.appendChild(chip);
  }

  let readyPromise = null;
  window.dashAuth = {
    // Resolves with the signed-in username, showing the login screen first if
    // nobody is signed in.
    ready(){
      if(!readyPromise){
        readyPromise = (async ()=>{
          const [state] = await Promise.all([whoAmI(), bodyReady()]);
          const user = state.user || await showLogin(state);
          root.classList.remove('auth-pending', 'auth-locked');
          mountUserChip(user);
          return user;
        })();
      }
      return readyPromise;
    },
    // A data request was refused because the session ended (expired, password
    // changed, logged out in another tab): start over at the login screen.
    expired(){ location.reload(); }
  };
})();
