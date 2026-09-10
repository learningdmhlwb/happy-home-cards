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
    contains:function(name){return classes.has(name);}
  };
}

function createDocument(){
  const state={elementsById:{},shuffle:null};
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
      disabled:false,
      classList:createClassList(),
      remove:function(){if(options&&options.onRemove)options.onRemove();}
    };
  }

  function parseHtml(html){
    state.elementsById={app};
    state.shuffle=html.indexOf('class="shuffle"')>-1?createElement({onRemove:function(){state.shuffle=null;}}):null;
    const idRegex=/id="([^"]+)"/g;
    let match;
    while((match=idRegex.exec(html))!==null){
      if(match[1]!=='app')state.elementsById[match[1]]=createElement();
    }
  }

  return {
    getElementById:function(id){return state.elementsById[id]||null;},
    querySelector:function(selector){return selector==='.shuffle'?state.shuffle:null;},
    querySelectorAll:function(){return [];}
  };
}

function loadApp(){
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
  const document=createDocument();
  const context={
    console:console,
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

test('main entry point removes shuffle status after dealing cards',function(){
  const app=loadApp();
  app.context.showNextCard('Things I Like');
  assert.equal(app.document.querySelector('.shuffle'),null);
});
