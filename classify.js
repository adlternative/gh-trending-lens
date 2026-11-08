// Shared by the extension page and the content script. Pure functions, no DOM.
// Categories are matched in order of `priority`; each rule hit adds its weight,
// the highest total wins. Text = name + description, lowercased.
const CATEGORIES = [
  { id: "skills",   label: "Skills / 资料",  color: "#d29922", priority: 1,
    rules: [
      [/\b(skills?|prompts?|cursor ?rules|claude\.md|agents\.md|\.cursorrules|rules for|instincts?|playbooks?|workflows? for|setup)\b/, 8],
      [/\b(awesome|curated|collection|cheat ?sheets?|tutorials?|courses?|roadmaps?|interview|handbook|guide|learn(ing)?|notes|papers?|books?|examples?|snippets?|templates?|boilerplate|starter)\b/, 3],
      [/(教程|面试|学习|指南|资料|合集|笔记|入门|技巧|大全|收集|整理|提示词)/, 3],
      [/\b(list of|resources|reading list|study|101|for beginners)\b/, 2],
    ]},
  { id: "ai",       label: "AI / Agent",    color: "#8957e5", priority: 2,
    rules: [
      [/\b(agents?|agentic|llms?|mcp|copilot|rag|langchain|langgraph|autogen|crewai|openai|anthropic|claude|gemini|gpt-?\d*|ollama|vllm|deepseek|qwen|llama|mistral)\b/, 4],
      [/\b(ai|ml|deep ?learning|machine ?learning|neural|transformer|diffusion|inference|embedding|fine-?tun\w*|lora|tokeni[sz]er|chatbot|assistant|multimodal|vision-language|text-to-\w+|speech|voice|voices|whisper|tts|stt|elevenlabs|text-to-speech|vector)\b/, 3],
      [/(大模型|智能体|人工智能|模型|推理|微调|对话|语音)/, 3],
      [/\b(model|models|prompt|coding assistant|code generation|autonomous)\b/, 1],
    ]},
  { id: "hardware", label: "硬件 / 嵌入式",  color: "#f78166", priority: 3,
    rules: [
      [/\b(esp32|esp8266|arduino|raspberry|rpi|stm32|risc-?v|fpga|verilog|vhdl|hdl|firmware|bootloader|uefi|bios|mcu|microcontroller|embedded|bare-?metal|rtos|zephyr|freertos|qmk|zmk|pcb|kicad|3d print\w*|cnc)\b/, 5],
      [/\b(kernel|drivers?|gpu|cuda|nvidia|amd|intel|arm64?|x86|hardware|robot\w*|drone|sensor|bluetooth|ble|iot|soc|silicon|chip|oscilloscope|sdr|radio|flipper)\b/, 2],
      [/(硬件|单片机|嵌入式|固件|开发板)/, 4],
    ]},
  { id: "security", label: "安全",          color: "#da3633", priority: 4,
    rules: [
      [/\b(security|pentest\w*|exploit\w*|cve-?\d*|vulnerab\w*|malware|reverse[- ]engineer\w*|ctf|fuzz\w*|osint|red[- ]team|blue[- ]team|scanner|forensic\w*|hacking|payload|c2|password|secrets?|encrypt\w*|zero-?trust|waf|siem)\b/, 4],
      [/(安全|渗透|漏洞|逆向|加密)/, 4],
    ]},
  { id: "data",     label: "数据 / 数据库",  color: "#1f6feb", priority: 5,
    rules: [
      [/\b(database|db|sql|postgres\w*|mysql|sqlite|clickhouse|duckdb|redis|mongodb|olap|oltp|lakehouse|warehouse|etl|elt|dataframe|analytics|spark|flink|kafka|stream processing|time-?series|vector database|graph database|dbt|airflow|jupyter|pandas|polars|arrow|parquet)\b/, 4],
      [/(数据库|数据仓库|数据分析|可视化)/, 4],
      [/\b(data|dashboard|visuali[sz]ation|charts?|plot\w*)\b/, 2],
    ]},
  { id: "games",    label: "游戏",          color: "#3fb950", priority: 6,
    rules: [
      [/\b(games?|game ?engine|minecraft|emulator|unity|godot|unreal|roguelike|rpg|mmo|sprite|voxel|chess|puzzle|nintendo|playstation|gamedev)\b/, 4],
      [/(游戏|模拟器)/, 4],
    ]},
  { id: "software", label: "传统软件",       color: "#8b949e", priority: 9,
    rules: [
      [/\b(cli|terminal|shell|editor|ide|framework|library|compiler|interpreter|runtime|language|http|server|proxy|vpn|browser|kubernetes|k8s|docker|container|devops|ci\/?cd|build|bundler|package manager|api|sdk|web|react|vue|svelte|next\.?js|frontend|backend|full-?stack|mobile|android|ios|desktop|electron|tauri|gui|tui|os|linux|windows|macos|file|sync|backup|note|markdown|pdf|image|video|audio|media|download|network|dns|monitoring|observability|logging|testing|linter|formatter|orm|auth|payment|e-?commerce|cms|blog|self-?hosted|productivity|automation|workflow|scheduler|queue|cache|storage|s3|cloud|serverless|wasm|webassembly|filesystem|compression|text|expander|remote|screen|recording)\b/, 1],
      [/(翻墙|科学上网|工具|客户端|桌面|编辑器|系统|自动|插件|管理|下载|播放器)/, 2],
    ]},
];

// Optional second level. Same mechanism: rules scored inside the winning category,
// highest wins, nothing matched -> "misc". Edit freely.
const SUBCATEGORIES = {
  skills: [
    { id: "agent-skills", label: "Agent Skills", rules: [[/\b(skills?|instincts?|playbooks?|claude\.md|agents\.md|cursor ?rules|\.cursorrules|rules for|setup|harness)\b/, 4], [/(技巧)/, 4]] },
    { id: "prompts",      label: "Prompts",      rules: [[/\b(prompts?|prompt engineering|system prompts?|jailbreak)\b/, 5], [/(提示词)/, 5]] },
    { id: "awesome",      label: "Awesome 清单", rules: [[/\b(awesome|curated|collection|list of|resources|links)\b/, 5], [/(合集|大全|收集|整理|资源)/, 5]] },
    { id: "learning",     label: "教程 / 课程",  rules: [[/\b(tutorials?|courses?|learn(ing)?|roadmaps?|handbook|guide|book|notes|101|for beginners|study|interview|cheat ?sheets?|papers?)\b/, 4], [/(教程|学习|入门|指南|笔记|面试|课程)/, 4]] },
    { id: "templates",    label: "模板 / 示例",  rules: [[/\b(templates?|boilerplate|starter|examples?|snippets?|samples?)\b/, 5], [/(模板|示例)/, 5]] },
  ],
  ai: [
    { id: "plugin",    label: "插件 / 集成",   rules: [[/\b(plugins?|extensions?|vscode|vs code|jetbrains|neovim|nvim|vim|emacs|obsidian|chrome|browser extension|integrations?|mcp[- ]servers?|mcp)\b/, 4], [/(插件|扩展|集成)/, 4]] },
    { id: "desktop",   label: "桌面 / 移动 App", rules: [[/\b(desktop|apps?|tauri|electron|gui|macos app|windows app|native|ios|android|mobile|menubar|tray)\b/, 3], [/(桌面|客户端|应用)/, 4]] },
    { id: "cli",       label: "Agent CLI",     rules: [[/\b(cli|terminal|tui|command[- ]line|shell|coding agents?|code agents?|codex|claude code|cursor|aider|opencode)\b/, 4], [/(终端|命令行)/, 4]] },
    { id: "framework", label: "框架 / SDK",    rules: [[/\b(frameworks?|sdk|library|toolkit|harness|orchestrat\w*|multi-?agent|workflow|runtime|building blocks|pipeline)\b/, 3], [/(框架|工具包)/, 4]] },
    { id: "model",     label: "模型 / 推理",   rules: [[/\b(models?|inference|serving|fine-?tun\w*|training|train|pretrain\w*|quantiz\w*|vllm|llama\.cpp|gguf|lora|weights|checkpoints?|\d+b)\b/, 3], [/(模型|推理|微调|训练)/, 4]] },
    { id: "memory",    label: "记忆 / RAG",    rules: [[/\b(memory|memories|rag|retrieval|vector|embedding|knowledge graph|context engineering|index(es|ing)?|search engine)\b/, 4], [/(记忆|检索|知识库)/, 4]] },
    { id: "browser",   label: "浏览器 / 自动化", rules: [[/\b(browser|headless|scrap\w*|crawl\w*|computer[- ]use|automation|playwright|puppeteer|web agent)\b/, 4], [/(浏览器|爬虫|自动化)/, 4]] },
    { id: "media",     label: "语音 / 多模态",  rules: [[/\b(voice|speech|tts|stt|audio|image|video|vision|avatar|multimodal|diffusion|text-to-\w+|music|3d)\b/, 3], [/(语音|图像|视频|多模态|数字人)/, 4]] },
    { id: "eval",      label: "评测 / 基准",    rules: [[/\b(benchmark\w*|evals?|evaluation|leaderboard|dataset|arena|measuring)\b/, 6], [/(评测|基准|数据集)/, 4]] },
    { id: "chat",      label: "聊天 / 助手",    rules: [[/\b(chat|chatbot|assistant|companion|bot|copilot|telegram|discord|slack|wechat|feishu|whatsapp)\b/, 3], [/(助手|聊天|机器人|微信|飞书)/, 4]] },
  ],
  software: [
    { id: "devtools", label: "开发工具",   rules: [[/\b(cli|terminal|editor|ide|compiler|linter|formatter|debugger|build|bundler|package manager|git|testing|devtools|sdk|library|framework)\b/, 3], [/(编辑器|编译器|开发)/, 4]] },
    { id: "web",      label: "Web / 前端",  rules: [[/\b(web|frontend|react|vue|svelte|next\.?js|css|tailwind|ui|components?|design system|website)\b/, 3], [/(前端|网站)/, 4]] },
    { id: "infra",    label: "系统 / 运维",  rules: [[/\b(kubernetes|k8s|docker|container|devops|ci\/?cd|infra\w*|cloud|serverless|monitoring|observability|logging|os|kernel|linux|vm|virtual\w*|hypervisor|storage|s3|backup)\b/, 3], [/(运维|部署|系统)/, 4]] },
    { id: "network",  label: "网络 / 代理",  rules: [[/\b(proxy|vpn|dns|network\w*|http|tunnel|firewall|router|wireguard|tailscale|remote desktop)\b/, 4], [/(翻墙|科学上网|代理|网络|远程)/, 4]] },
    { id: "apps",     label: "桌面 / 媒体应用", rules: [[/\b(desktop|apps?|electron|tauri|gui|music|video|audio|player|download\w*|screen|recording|notes?|markdown|pdf|image|photo|productivity|launcher|clipboard)\b/, 3], [/(桌面|客户端|播放器|下载|笔记|截图)/, 4]] },
    { id: "backend",  label: "后端 / 业务",   rules: [[/\b(api|backend|server|auth|payment|e-?commerce|cms|blog|self-?hosted|saas|erp|crm|workflow|automation|scheduler|queue)\b/, 3], [/(后台|自托管|业务)/, 4]] },
  ],
  hardware: [
    { id: "firmware", label: "嵌入式 / 固件", rules: [[/\b(esp32|esp8266|arduino|stm32|mcu|microcontroller|firmware|rtos|zephyr|freertos|embedded|bare-?metal|bootloader|idf|sdk|hal)\b/, 4], [/(单片机|嵌入式|固件)/, 4]] },
    { id: "silicon",  label: "芯片 / FPGA",   rules: [[/\b(fpga|verilog|vhdl|hdl|risc-?v|soc|silicon|chip|asic|cpu|gpu)\b/, 4], [/(芯片)/, 4]] },
    { id: "driver",   label: "驱动 / 内核",   rules: [[/\b(kernel|drivers?|linux|uefi|bios|module)\b/, 4], [/(驱动|内核)/, 4]] },
    { id: "robot",    label: "机器人 / 设备", rules: [[/\b(robot\w*|drone|sensor|iot|bluetooth|ble|3d print\w*|cnc|keyboard|qmk|zmk|pcb|kicad|sdr|radio|flipper|raspberry|rpi)\b/, 4], [/(机器人|开发板|无人机|键盘)/, 4]] },
  ],
};
const MISC_SUB = { id: "misc", label: "其他" };

function classifySub(catId, repo, extraSubs = {}) {
  const subs = SUBCATEGORIES[catId];
  if (!subs) return null;
  const text = `${repo.name} ${repo.description || ""}`.toLowerCase().replace(/[_/-]+/g, " ");
  let best = null, bestScore = 0;
  for (const sub of subs) {
    let score = 0;
    for (const [re, w] of sub.rules) {
      const m = text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
      if (m) score += w * Math.min(m.length, 3);
    }
    for (const kw of extraSubs[`${catId}/${sub.id}`] || []) if (kw && text.includes(kw.toLowerCase())) score += 4;
    if (score > bestScore) { best = sub; bestScore = score; }
  }
  return best ? best.id : "misc";
}
function subLabel(catId, subId) {
  return (SUBCATEGORIES[catId] || []).find(s => s.id === subId)?.label || (subId === "misc" ? MISC_SUB.label : "");
}

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const OTHER = { id: "other", label: "其他", color: "#6e7681", priority: 99 };

function classifyRepo(repo, extraRules = {}) {
  const text = `${repo.name} ${repo.description || ""}`.toLowerCase().replace(/[_/-]+/g, " ");
  let best = null, bestScore = 0;
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const [re, w] of cat.rules) {
      const m = text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
      if (m) score += w * Math.min(m.length, 3);
    }
    for (const kw of extraRules[cat.id] || []) {
      if (kw && text.includes(kw.toLowerCase())) score += 4;
    }
    if (score > bestScore || (score === bestScore && score > 0 && best && cat.priority < best.priority)) {
      best = cat; bestScore = score;
    }
  }
  if (best) return best.id;
  // nothing matched: an undescribed repo is "other", anything else is ordinary software
  return text.trim().split(/\s+/).length < 3 ? "other" : "software";
}

if (typeof module !== "undefined") module.exports = { CATEGORIES, CATEGORY_BY_ID, OTHER, SUBCATEGORIES, classifyRepo, classifySub, subLabel };
