const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  const user = tg.initDataUnsafe?.user;
  if (user) {
    document.getElementById('hello').textContent = `Привет, ${user.first_name || ''}!`;
    document.getElementById('userMeta').textContent = `Telegram ID: ${user.id}`;
  }
}

document.querySelectorAll('button[data-page]').forEach(btn=>{
 btn.onclick=()=>{
  const page=btn.dataset.page;
  document.getElementById('panel').innerHTML=`<h2>${page}</h2><p>Раздел готов к подключению данных CRM.</p>`;
 }
});
