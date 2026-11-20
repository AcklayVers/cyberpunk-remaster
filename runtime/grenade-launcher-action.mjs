import { isGrenadeLauncher, sanitizeLauncherSource, removeLegacyLauncherCast, migrateLauncherItemsOnActor } from './grenade-launcher-compat.mjs';
const MODULE_ID='cyberpunk-remaster';
const LOADED='launcherLoaded';
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function magazineCapacity(launcher) {
  return Math.max(1,Math.min(100,Number(launcher?.system?.ammo?.capacity)||1));
}
export function launcherLoaded(launcher) {
  const raw=launcher?.getFlag?.(MODULE_ID,LOADED);
  return raw===undefined||raw===null ? magazineCapacity(launcher) : Math.min(magazineCapacity(launcher),Math.max(0,Math.trunc(Number(raw)||0)));
}
export function compatibleAmmunition(launcher,actor) {
  const rocket=/реактивн|rocket|raket/iu.test(`${launcher?.name??''} ${launcher?.system?.baseItem??''}`);
  return [...(actor?.items??[])].filter((item)=>{
    const text=`${item?.name??''} ${item?.system?.slug??''} ${item?.system?.baseItem??''}`;
    if (!(Number(item?.system?.quantity??0)>0)) return false;
    return /гранат|grenade/iu.test(text) || (rocket && /ракет|rocket|raketa/iu.test(text));
  });
}
function classDC(actor) {
  try {
    const dc=Number(actor?.getStatistic?.('class')?.dc?.value ?? actor?.system?.attributes?.classDC?.value);
    return Number.isFinite(dc)&&dc>0?dc:null;
  } catch{return null;}
}
function inlineDamage(ammunition) {
  const d=ammunition?.system?.damage??{};
  const dice=Number(d.dice);
  const die=String(d.die??'');
  const type=String(d.damageType??'');
  if (Number.isInteger(dice)&&dice>0&&dice<=99&&/^d(?:4|6|8|10|12|20)$/u.test(die)&&/^[a-z-]+$/u.test(type)) {
    return ` @Damage[${dice}${die}[${type}]]`;
  }
  return '';
}
export async function fireGrenadeLauncher({launcher,ammunition,createMessage}) {
  if (!isGrenadeLauncher(launcher)) throw new Error('Выбранный предмет не является гранатомётом.');
  if (launcherLoaded(launcher)<1) return {fired:false,reason:'empty'};
  const quantity=Number(ammunition?.system?.quantity??0);
  if (!Number.isInteger(quantity)||quantity<1) return {fired:false,reason:'no-ammo'};
  if (typeof ammunition.update!=='function'||typeof launcher.setFlag!=='function') throw new Error('Нет прав изменять оружие или боеприпасы.');
  const loaded=launcherLoaded(launcher);
  // Do not touch any damage, traits, actor or CPEL flags. Only the ammo count and
  // independent Remaster magazine counter are altered on explicit firing.
  await ammunition.update({'system.quantity':quantity-1});
  try { await launcher.setFlag(MODULE_ID,LOADED,loaded-1); }
  catch(error) {
    await ammunition.update({'system.quantity':quantity}).catch(()=>{});
    throw error;
  }
  const dc=classDC(launcher.actor);
  const grenade=`<strong>${esc(ammunition.name)}</strong>`;
  const kind=/гранат|grenade/iu.test(`${ammunition.name??''} ${ammunition.system?.baseItem??''}`)?'Граната':'Ракета';
  const check=dc===null?'<em>КС класса определяется по листу стрелка.</em>':`@Check[reflex|dc:${dc}|basic|showDC:all]`;
  const range=Number(launcher.system?.range);
  const rangeText=Number.isFinite(range)&&range>0?` Дальность пуска: ${range} футов.`:'';
  const content=`<div class="chat-card"><h3>${esc(launcher.name)} — выстрел</h3><p><strong>Два действия.</strong> ${kind}: ${grenade}.${rangeText} Площадь, тип урона и дополнительные эффекты берутся из описания боеприпаса. Для гранат применяется Area Fire и КС класса стрелка.</p><p>${check}${inlineDamage(ammunition)}</p><p>Зарядов в магазине: ${loaded-1} / ${magazineCapacity(launcher)}. Перезарядка — 2 действия.</p></div>`;
  const send=createMessage??((data)=>globalThis.ChatMessage.create(data));
  await send({speaker:globalThis.ChatMessage?.getSpeaker?.({actor:launcher.actor}),content,flags:{[MODULE_ID]:{launcherFiring:true,launcherId:launcher.id,ammunitionId:ammunition.id}}});
  return {fired:true,loaded:loaded-1,dc};
}
export async function reloadGrenadeLauncher({launcher}) {
  if(!isGrenadeLauncher(launcher)) throw new Error('Это не гранатомёт.');
  const value=magazineCapacity(launcher);
  await launcher.setFlag(MODULE_ID,LOADED,value);
  return value;
}

async function chooseAmmo(launcher,actor) {
  const available=compatibleAmmunition(launcher,actor);
  if(!available.length){globalThis.ui?.notifications?.warn?.('Нет подходящих гранат или ракет в инвентаре.');return null;}
  const content=`<form class="cp-launcher-ammo"><label>Боеприпас<select name="ammo">${available.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} (×${Number(a.system.quantity)})</option>`).join('')}</select></label></form>`;
  const DialogV2=globalThis.foundry?.applications?.api?.DialogV2;
  if (DialogV2?.wait) {
    const result=await DialogV2.wait({window:{title:'Выстрел гранатой'},content,buttons:[
      {action:'fire',label:'Выстрелить (2 действия)',default:true,callback:(_event,button,dialog)=>dialog.element?.querySelector?.('select[name="ammo"]')?.value??button.form?.elements?.ammo?.value??null},
      {action:'cancel',label:'Отмена',callback:()=>null},
    ]});
    return available.find(a=>a.id===result)??null;
  }
  if(globalThis.Dialog?.wait){
    const id=await globalThis.Dialog.wait({title:'Выстрел гранатой',content,buttons:{fire:{label:'Выстрелить (2 действия)',callback:(html)=>html.find('select[name="ammo"]').val()},cancel:{label:'Отмена',callback:()=>null}},default:'fire'});
    return available.find(a=>a.id===id)??null;
  }
  throw new Error('API диалогов Foundry недоступен.');
}

async function onFire(launcher) {
  const actor=launcher.actor;
  if(!actor || !launcher.isOwner){globalThis.ui?.notifications?.warn?.('Необходимы права владельца оружия.');return;}
  if(launcherLoaded(launcher)===0){globalThis.ui?.notifications?.warn?.('Гранатомёт разряжен. Выберите перезарядку.');return;}
  const ammo=await chooseAmmo(launcher,actor);
  if(!ammo)return;
  try {
    const result=await fireGrenadeLauncher({launcher,ammunition:ammo});
    if (!result.fired)globalThis.ui?.notifications?.warn?.('Выстрел невозможен: нет боеприпаса или зарядов.');
  }catch(error){console.error(`${MODULE_ID} | Launcher activation failed`,error);globalThis.ui?.notifications?.error?.(`Не удалось выстрелить: ${error.message}`);}
}
async function onReload(launcher) {
  try {
    await reloadGrenadeLauncher({launcher});
    await globalThis.ChatMessage.create({speaker:globalThis.ChatMessage.getSpeaker({actor:launcher.actor}),content:`<p><strong>${esc(launcher.name)}:</strong> Перезарядка (2 действия). Магазин: ${magazineCapacity(launcher)}.</p>`});
  }catch(error){globalThis.ui?.notifications?.error?.(`Перезарядка не удалась: ${error.message}`);}
}

function injectLauncherControls(app,html) {
  const launcher=app?.item??app?.document;
  if(!isGrenadeLauncher(launcher)||!launcher.actor||!launcher.isOwner)return;
  const element=html?.querySelector?html:html?.[0];
  if(!element?.querySelector||element.querySelector('[data-cp-launcher-controls]'))return;
  const parent=element.querySelector('.window-content')??element.querySelector('.sheet-body')??element;
  const row=document.createElement('div');
  row.dataset.cpLauncherControls='1';
  row.className='cp-launcher-controls';
  row.style.cssText='display:flex;gap:0.5rem;padding:0.35rem 0.6rem;align-items:center;flex-wrap:wrap';
  const fire=document.createElement('button');fire.type='button';fire.textContent='Выстрел из гранатомёта (2 действия)';
  fire.addEventListener('click',()=>void onFire(launcher));row.append(fire);
  const reload=document.createElement('button');reload.type='button';reload.textContent='Перезарядить (2 действия)';
  reload.addEventListener('click',()=>void onReload(launcher));row.append(reload);
  parent.prepend(row);
}

if(globalThis.Hooks?.on){
  // A false sanitizer result means no repair was needed; creation remains allowed.
  Hooks.on('preCreateItem',(item)=>{ sanitizeLauncherSource(item); });
  Hooks.on('preUpdateItem',(item,changes)=>{
    const rules=changes?.system?.rules??changes?.['system.rules'];
    if (!Array.isArray(rules))return;
    const result=removeLegacyLauncherCast({name:changes.name??item.name,type:item.type,system:{baseItem:item.system?.baseItem,rules}});
    if(!result.changed)return;
    if(changes.system?.rules)changes.system.rules=result.rules;
    else changes['system.rules']=result.rules;
    changes['flags.cyberpunk-remaster.legacyItemCastBackup']=[
      ...(Array.isArray(item.flags?.[MODULE_ID]?.legacyItemCastBackup)?item.flags[MODULE_ID].legacyItemCastBackup:[]),
      ...result.removed,
    ];
  });
  // Forge can create Actors with embedded Item sources in one Actor.create().
  // Such nested items do not necessarily fire preCreateItem individually.
  Hooks.on('createActor',(actor,_options,userId)=>{
    if(userId!==globalThis.game?.user?.id)return;
    void migrateLauncherItemsOnActor(actor).catch((e)=>console.error(`${MODULE_ID} | New actor launcher migration`,e));
  });
  Hooks.on('createToken',(token,_options,userId)=>{
    if(userId!==globalThis.game?.user?.id||token.actorLink||!token.actor)return;
    void migrateLauncherItemsOnActor(token.actor).catch((e)=>console.error(`${MODULE_ID} | New token launcher migration`,e));
  });
  Hooks.on('renderItemSheet',injectLauncherControls);
  Hooks.on('renderItemSheetV2',injectLauncherControls);
}
