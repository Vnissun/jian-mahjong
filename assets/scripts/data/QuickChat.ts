/** Stable IDs shared by the UI and server; only these messages may be sent. */
export const QUICK_PHRASES = [
    {id:'great',text:'您的牌打得也忒好了呀！'},
    {id:'hurry',text:'快点啊，都等得我花儿都谢了！'},
    {id:'hello',text:'大家好，很高兴见到各位！'},
    {id:'thanks',text:'手抖了，不好意思啊！'},
    {id:'nice',text:'我墙都不扶，就服你！'},
    {id:'careful',text:'这谁顶得住啊！'},
    {id:'luck',text:'遥遥领先！'},
    {id:'unlucky',text:'心态崩了呀！'},
    {id:'thinking',text:'我能怎么办，我也很绝望啊！'},
    {id:'again',text:'不要走，决战到天亮啦！'},
    {id:'friends',text:'加个好友，以后一起玩！'},
    {id:'amazing',text:'老铁666啊！'},
] as const;
export const QUICK_EMOJIS = [
    {id:'poop',text:'💩',label:'扔粑粑'}, {id:'tomato',text:'🍅',label:'扔臭番茄'},
    {id:'egg',text:'🥚',label:'扔鸡蛋'}, {id:'slipper',text:'🩴',label:'扔拖鞋'},
    {id:'bomb',text:'💣',label:'扔炸弹'},
    {id:'laugh',text:'😄',label:'开心'}, {id:'like',text:'👍',label:'厉害'},
    {id:'wow',text:'😮',label:'惊讶'}, {id:'cry',text:'😭',label:'哭哭'},
    {id:'think',text:'🤔',label:'思考'}, {id:'clap',text:'👏',label:'鼓掌'},
    {id:'cool',text:'😎',label:'得意'}, {id:'sweat',text:'😅',label:'汗颜'},
    {id:'tea',text:'🍵',label:'喝茶'}, {id:'flower',text:'🌹',label:'送花'},
    {id:'celebrate',text:'🎉',label:'庆祝'}, {id:'handshake',text:'🤝',label:'握手'},
] as const;

export const THROW_EMOJI_IDS: readonly string[] = ['poop','tomato','egg','slipper','bomb'];
