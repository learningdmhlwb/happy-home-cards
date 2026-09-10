const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function createClassList(){
  const set=new Set();
  return {
    add:function(name){set.add(name);},
    remove:function(name){set.delete(name);},
    contains:function(name){return set.has(name);},
    toggle:function(name){if(set.has(name)){set.delete(name);return false;}set.add(name);return true;}
  };
}

function createDocument(){
  const state={elementsById:{},cards:[],speaks:[],preferences:[],shuffle:null};
  const app={_innerHTML:'',onclick:null};
  Object.defineProperty(app,'innerHTML',{
    get:function(){return this._innerHTML;},
    set:function(value){this._innerHTML=value;parseHtml(String(value));}
  });
  state.elementsById.app=app;

  function createElement(options){
    const element={
      onclick:null,
      onkeydown:null,
      classList:createClassList(),
      getAttribute:function(name){return options.attributes&&options.attributes[name];},
      closest:function(selector){
        if(selector==='.card')return options.card||null;
        if(selector==='.title')return options.title||null;
        return null;
      },
      querySelector:function(selector){
        if(selector==='span'&&options.titleText!==undefined)return {textContent:options.titleText};
        return null;
      },
      remove:function(){if(options.onRemove)options.onRemove();}
    };
    if(options.classNames){
      for(const className of options.classNames){element.classList.add(className);}
    }
    return element;
  }

  function parseHtml(html){
    state.elementsById={app};
    state.cards=[];
    state.speaks=[];
    state.preferences=[];
    state.shuffle=html.indexOf('class="shuffle"')>-1?createElement({classNames:['shuffle'],onRemove:function(){state.shuffle=null;}}):null;

    const idRegex=/id="([^"]+)"/g;
    let idMatch;
    while((idMatch=idRegex.exec(html))!==null){
      if(idMatch[1]!=='app'){state.elementsById[idMatch[1]]=createElement({});}
    }

    const cardRegex=/<div class="card"[\s\S]*?<div class="title"><span>([^<]+)<\/span><div class="card-buttons">([\s\S]*?)<\/div><\/div><\/div><\/div><\/div>/g;
    let cardMatch;
    while((cardMatch=cardRegex.exec(html))!==null){
      const titleText=cardMatch[1];
      const buttonMarkup=cardMatch[2];
      const title=createElement({titleText:titleText});
      const card=createElement({classNames:['card'],titleText:titleText});
      card.cardTitle=titleText;
      card.querySelector=function(selector){return selector==='span'?{textContent:titleText}:null;};
      state.cards.push(card);

      if(buttonMarkup.indexOf('class="speak"')>-1){
        state.speaks.push(createElement({title:title}));
      }

      const preferenceMatch=buttonMarkup.match(/class="preference-btn"[^>]*data-title="([^"]+)"[^>]*data-action="([^"]+)"/);
      if(preferenceMatch){
        state.preferences.push(createElement({
          card:card,
          attributes:{'data-title':preferenceMatch[1],'data-action':preferenceMatch[2]}
        }));
      }
    }
  }

  return {
    app:app,
    getElementById:function(id){return state.elementsById[id]||null;},
    querySelectorAll:function(selector){
      if(selector==='.card')return state.cards;
      if(selector==='.speak')return state.speaks;
      if(selector==='.preference-btn')return state.preferences;
      return [];
    },
    querySelector:function(selector){return selector==='.shuffle'?state.shuffle:null;}
  };
}

function loadApp(fileName){
  const html=fs.readFileSync(path.join(__dirname,'..',fileName||'index.html'),'utf8');
  const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
  const document=createDocument();
  const speechLog=[];
  const context={
    console:console,
    document:document,
    window:null,
    Math:Math,
    prompt:function(){return null;},
    setTimeout:function(fn){fn();},
    speechSynthesis:{
      cancel:function(){},
      speak:function(utterance){speechLog.push(utterance.text);}
    },
    SpeechSynthesisUtterance:function(text){this.text=text;}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(script,context);
  return {context,speechLog,document};
}

test('showCards renders title, sound button, and preference button for each card',function(){
  const app=loadApp();
  app.context.showCards('Things I Like');
  assert.equal(app.document.querySelectorAll('.card').length,2);
  assert.equal(app.document.querySelectorAll('.speak').length,2);
  assert.equal(app.document.querySelectorAll('.preference-btn').length,2);
  assert.match(app.document.app.innerHTML,/<div class="title"><span>[^<]+<\/span><div class="card-buttons">/);
});

test('shuffle status is removed after cards are shown in both entry points',function(){
  for(const fileName of ['index.html','index-experimental.html']){
    const app=loadApp(fileName);
    app.context.showCards('Things I Like');
    assert.equal(app.document.querySelector('.shuffle'),null);
  }
});

test('sound button speaks the rendered card title',function(){
  const app=loadApp();
  app.context.showCards('Things I Like');
  const firstCard=app.document.querySelectorAll('.card')[0];
  const speakButton=app.document.querySelectorAll('.speak')[0];
  speakButton.onclick({stopPropagation:function(){}});
  assert.deepEqual(app.speechLog,[firstCard.cardTitle]);
});

test('liking an already-favourited card does not add a duplicate entry',function(){
  const app=loadApp();
  app.context.showCards('Things I Like');
  const likeButton=app.document.querySelectorAll('.preference-btn')[0];
  const cardTitle=likeButton.getAttribute('data-title');
  app.context.favourites.push(cardTitle);
  likeButton.onclick({stopPropagation:function(){}});
  assert.equal(app.context.favourites.filter(function(title){return title===cardTitle;}).length,1);
});

test('html entry points load Atkinson Hyperlegible as the body font',function(){
  for(const fileName of ['index.html','index-experimental.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',fileName),'utf8');
    assert.match(html,/https:\/\/fonts\.googleapis\.com\/css2\?family=Atkinson\+Hyperlegible:wght@400;700&display=swap/);
    assert.match(html,/body\{font-family:'Atkinson Hyperlegible',sans-serif/);
  }
});

test('html entry points right-align and center card controls',function(){
  for(const fileName of ['index.html','index-experimental.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',fileName),'utf8');
    assert.match(html,/\.title\{[^}]*align-items:center[^}]*gap:10px/);
    assert.match(html,/\.title span\{flex:1;text-align:left\}/);
    assert.match(html,/\.card-buttons\{[^}]*align-items:center[^}]*justify-content:flex-end[^}]*flex:1/);
  }
});
