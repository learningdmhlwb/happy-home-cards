const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function createClassList(){
  const classes=new Set();
  return {
    add:function(name){classes.add(name);},
    remove:function(name){classes.delete(name);},
    contains:function(name){return classes.has(name);},
    toggle:function(name){if(classes.has(name)){classes.delete(name);return false;}classes.add(name);return true;}
  };
}

function createDocument(){
  const state={elementsById:{},cards:[]};
  const app={_innerHTML:''};
  Object.defineProperty(app,'innerHTML',{
    get:function(){return this._innerHTML;},
    set:function(value){this._innerHTML=String(value);parseHtml(this._innerHTML);}
  });
  state.elementsById.app=app;

  function createElement(options){
    return {
      onclick:null,
      onkeydown:null,
      classList:createClassList(),
      remove:function(){if(options&&options.onRemove)options.onRemove();}
    };
  }

  function parseHtml(html){
    state.elementsById={app};
    state.cards=[];
    const idRegex=/id="([^"]+)"/g;
    let idMatch;
    while((idMatch=idRegex.exec(html))!==null){
      if(idMatch[1]!=='app')state.elementsById[idMatch[1]]=createElement();
    }
    const titleRegex=/<div class="title"><span>([^<]+)<\/span>/g;
    const titles=[];
    let titleMatch;
    while((titleMatch=titleRegex.exec(html))!==null){titles.push(titleMatch[1]);}
    const cardCount=(html.match(/<div class="card"/g)||[]).length;
    for(let i=0;i<cardCount;i++){
      const card=createElement();
      card.cardTitle=titles[i]||'';
      state.cards.push(card);
    }
  }

  return {
    getElementById:function(id){return state.elementsById[id]||null;},
    querySelectorAll:function(selector){return selector==='.card'?state.cards:[];},
    querySelector:function(){return null;}
  };
}

function loadApp(){
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
  const document=createDocument();
  const context={
    document:document,
    window:null,
    Math:Math,
    prompt:function(){return null;},
    setTimeout:function(fn){fn();},
    speechSynthesis:{cancel:function(){},speak:function(){}},
    SpeechSynthesisUtterance:function(text){this.text=text;}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(script,context);
  return {context,document};
}

test('showNextCard reattaches card click handlers after next cards render',function(){
  const app=loadApp();
  app.context.draw('Things I Like');

  const firstRenderCards=app.document.querySelectorAll('.card');
  assert.equal(firstRenderCards.length,2);
  for(const card of firstRenderCards){
    assert.equal(typeof card.onclick,'function');
  }
  firstRenderCards[0].onclick();
  assert.equal(firstRenderCards[0].classList.contains('flipped'),true);

  const firstTitles=firstRenderCards.map(function(card){return card.cardTitle;});
  app.document.getElementById('reshuffle').onclick();

  const secondRenderCards=app.document.querySelectorAll('.card');
  assert.equal(secondRenderCards.length,2);
  for(const card of secondRenderCards){
    assert.equal(typeof card.onclick,'function');
  }
  secondRenderCards[0].onclick();
  assert.equal(secondRenderCards[0].classList.contains('flipped'),true);
  assert.notDeepEqual(secondRenderCards.map(function(card){return card.cardTitle;}),firstTitles);
});
