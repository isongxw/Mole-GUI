/*
 * Mole GUI — mock bridge + fixtures for Chrome headless snapshots and dev.
 *
 * Loaded by app.js only when mock mode is selected (?mock=1, or the host-injected
 * globals __MOLE_MOCK__, __MOLE_MOCK_SCREEN__, __MOLE_MOCK_SCENARIO__). It fakes
 * the exact native seam:
 *   window.webkit.messageHandlers.mole.postMessage({action, ...})
 *   window.__moleNative(JSON.stringify(event))
 *
 * Fixtures are generated from fixtures/* by the build step; keep them in
 * sync when the CLI contract changes. Usernames are scrubbed to /Users/example.
 */
(function () {
  'use strict';

  var FIXTURES = {"status":"{\n  \"collected_at\": \"2026-10-17T21:46:07.538862+08:00\",\n  \"host\": \"example-host.local\",\n  \"platform\": \"darwin 26.6.2\",\n  \"uptime\": \"18d 23h\",\n  \"uptime_seconds\": 1641479,\n  \"procs\": 970,\n  \"hardware\": {\n    \"model\": \"MacBook Pro\",\n    \"cpu_model\": \"Apple M5\",\n    \"total_ram\": \"32.0 GB\",\n    \"disk_size\": \"926.3 GB\",\n    \"os_version\": \"macOS 26.6.2\",\n    \"refresh_rate\": \"\"\n  },\n  \"health_score\": 97,\n  \"health_score_msg\": \"Excellent: Restart Recommended\",\n  \"cpu\": {\n    \"usage\": 28.182592099208826,\n    \"per_core\": [\n      39.55481060748586,\n      29.66610795741314,\n      27.272727271524634,\n      19.77740530374293,\n      9.888702651871466,\n      9.888702650972094,\n      39.55481060658649,\n      29.666107955164712,\n      36.36363636637988,\n      39.55481060658649\n    ],\n    \"per_core_estimated\": false,\n    \"load1\": 3.22509765625,\n    \"load5\": 3.3828125,\n    \"load15\": 3.0654296875,\n    \"core_count\": 10,\n    \"logical_cpu\": 10,\n    \"p_core_count\": 4,\n    \"e_core_count\": 6\n  },\n  \"gpu\": [\n    {\n      \"name\": \"Apple M5\",\n      \"usage\": -1,\n      \"memory_used\": 0,\n      \"memory_total\": 0,\n      \"core_count\": 10,\n      \"note\": \"sppci_vendor_Apple\"\n    }\n  ],\n  \"memory\": {\n    \"used\": 21448310784,\n    \"total\": 34359738368,\n    \"available\": 12911427584,\n    \"used_percent\": 62.422800064086914,\n    \"swap_used\": 0,\n    \"swap_total\": 0,\n    \"cached\": 10521149440,\n    \"pressure\": \"\"\n  },\n  \"disks\": [\n    {\n      \"mount\": \"/\",\n      \"device\": \"/dev/disk3s1s1\",\n      \"used\": 671207907328,\n      \"total\": 994610155520,\n      \"used_percent\": 67.48452181016395,\n      \"fstype\": \"apfs\",\n      \"external\": false,\n      \"smart_status\": \"verified\"\n    }\n  ],\n  \"trash_size\": 0,\n  \"trash_approx\": false,\n  \"disk_io\": {\n    \"read_rate\": 0,\n    \"write_rate\": 0\n  },\n  \"network\": [\n    {\n      \"name\": \"en0\",\n      \"rx_rate_mbs\": 0.11762619018554688,\n      \"tx_rate_mbs\": 0.16988754272460938,\n      \"ip\": \"192.0.2.10\"\n    },\n    {\n      \"name\": \"en4\",\n      \"rx_rate_mbs\": 0,\n      \"tx_rate_mbs\": 0,\n      \"ip\": \"\"\n    },\n    {\n      \"name\": \"en5\",\n      \"rx_rate_mbs\": 0,\n      \"tx_rate_mbs\": 0,\n      \"ip\": \"\"\n    }\n  ],\n  \"network_history\": {\n    \"rx_history\": [\n      0.11762619018554688\n    ],\n    \"tx_history\": [\n      0.16988754272460938\n    ]\n  },\n  \"proxy\": {\n    \"enabled\": true,\n    \"type\": \"SOCKS\",\n    \"host\": \"127.0.0.1:7897\"\n  },\n  \"batteries\": [\n    {\n      \"percent\": 63,\n      \"status\": \"AC\",\n      \"time_left\": \"\",\n      \"health\": \"Good\",\n      \"cycle_count\": 26,\n      \"capacity\": 100\n    }\n  ],\n  \"thermal\": {\n    \"cpu_temp\": 0,\n    \"gpu_temp\": 0,\n    \"battery_temp\": 31.03,\n    \"fan_speed\": 0,\n    \"fan_count\": 0,\n    \"system_power\": 45.232,\n    \"adapter_power\": 68,\n    \"battery_power\": -9.389\n  },\n  \"sensors\": null,\n  \"bluetooth\": [\n    {\n      \"name\": \"Example Headphones\",\n      \"connected\": false,\n      \"battery\": \"\"\n    },\n    {\n      \"name\": \"Example Earbuds\",\n      \"connected\": false,\n      \"battery\": \"\"\n    },\n    {\n      \"name\": \"Example Keyboard\",\n      \"connected\": false,\n      \"battery\": \"\"\n    },\n    {\n      \"name\": \"Example Keyboard\",\n      \"connected\": false,\n      \"battery\": \"\"\n    },\n    {\n      \"name\": \"Example Mouse\",\n      \"connected\": false,\n      \"battery\": \"\"\n    },\n    {\n      \"name\": \"Example AirPods\",\n      \"connected\": false,\n      \"battery\": \"\"\n    },\n    {\n      \"name\": \"Example AirPods\",\n      \"connected\": false,\n      \"battery\": \"\"\n    }\n  ],\n  \"top_processes\": [\n    {\n      \"pid\": 41795,\n      \"ppid\": 13547,\n      \"name\": \"Example Browser Helper (Renderer)\",\n      \"command\": \"Example Browser Helper (Renderer)\",\n      \"cpu\": 95.2,\n      \"memory\": 1.1,\n      \"memory_bytes\": 382205952\n    },\n    {\n      \"pid\": 405,\n      \"ppid\": 1,\n      \"name\": \"WindowServer\",\n      \"command\": \"WindowServer\",\n      \"cpu\": 44.6,\n      \"memory\": 0.5,\n      \"memory_bytes\": 165543936\n    },\n    {\n      \"pid\": 13547,\n      \"ppid\": 1,\n      \"name\": \"Example Browser\",\n      \"command\": \"Example Browser\",\n      \"cpu\": 27.9,\n      \"memory\": 1.6,\n      \"memory_bytes\": 560037888\n    },\n    {\n      \"pid\": 899,\n      \"ppid\": 1,\n      \"name\": \"XprotectService\",\n      \"command\": \"XprotectService\",\n      \"cpu\": 25.4,\n      \"memory\": 0.1,\n      \"memory_bytes\": 44843008\n    },\n    {\n      \"pid\": 41842,\n      \"ppid\": 13547,\n      \"name\": \"Example Browser Helper (Renderer)\",\n      \"command\": \"Example Browser Helper (Renderer)\",\n      \"cpu\": 22.8,\n      \"memory\": 0.5,\n      \"memory_bytes\": 178307072\n    }\n  ],\n  \"process_collected_at\": \"2026-10-17T21:46:07.538862+08:00\",\n  \"process_stale\": false,\n  \"zombie_count\": 1,\n  \"zombie_parents\": [\n    {\n      \"pid\": 39987,\n      \"name\": \"example-helper\",\n      \"count\": 1\n    }\n  ],\n  \"zombie_parents_complete\": true,\n  \"process_watch\": {\n    \"enabled\": true,\n    \"cpu_threshold\": 100,\n    \"window\": \"5m0s\"\n  },\n  \"process_alerts\": []\n}\n","history":"{\n  \"logs\": {\"operations\": \"/Users/example/Library/Logs/mole/operations.log\", \"deletions\": \"/Users/example/Library/Logs/mole/deletions.log\"},\n  \"limit\": 20,\n  \"sessions\": [\n    {\n      \"command\": \"uninstall\",\n      \"run_id\": \"\",\n      \"attribution\": \"command\",\n      \"started_at\": \"2026-10-17 21:44:57\",\n      \"ended_at\": \"2026-10-17 21:44:57\",\n      \"items\": 0,\n      \"size\": \"0B\",\n      \"operation_count\": 0,\n      \"failed_tasks\": 0,\n      \"actions\": {\"removed\": 0, \"trashed\": 0, \"skipped\": 0, \"failed\": 0, \"rebuilt\": 0, \"other\": 0}\n    },\n    {\n      \"command\": \"clean\",\n      \"run_id\": \"\",\n      \"attribution\": \"command\",\n      \"started_at\": \"2026-08-16 16:17:26\",\n      \"ended_at\": \"\",\n      \"items\": 0,\n      \"size\": \"0B\",\n      \"operation_count\": 2,\n      \"failed_tasks\": 0,\n      \"actions\": {\"removed\": 2, \"trashed\": 0, \"skipped\": 0, \"failed\": 0, \"rebuilt\": 0, \"other\": 0}\n    }\n  ],\n  \"deletions\": [\n\n  ]\n}\n","apps":"[\n  {\"name\": \"Qoder\", \"bundle_id\": \"com.qoder.ide\", \"source\": \"App\", \"uninstall_name\": \"Qoder\", \"path\": \"/Applications/Qoder.app\", \"size\": \"728.0MB\"},\n  {\"name\": \"Z-Library\", \"bundle_id\": \"zlibrary\", \"source\": \"App\", \"uninstall_name\": \"Z-Library\", \"path\": \"/Applications/Z-Library.app\", \"size\": \"--\"},\n  {\"name\": \"Parallels Desktop\", \"bundle_id\": \"com.parallels.desktop.console\", \"source\": \"App\", \"uninstall_name\": \"Parallels Desktop\", \"path\": \"/Applications/Parallels Desktop.app\", \"size\": \"--\"},\n  {\"name\": \"Parallels Desktop Activation Tool SIP ON\", \"bundle_id\": \"app.macked.parallels-desktop.activation\", \"source\": \"App\", \"uninstall_name\": \"Parallels Desktop Activation Tool SIP ON\", \"path\": \"/Applications/Parallels Desktop Activation Tool SIP ON.app\", \"size\": \"6.4MB\"},\n  {\"name\": \"Tencent Lemon\", \"bundle_id\": \"com.tencent.Lemon\", \"source\": \"App\", \"uninstall_name\": \"Tencent Lemon\", \"path\": \"/Applications/Tencent Lemon.app\", \"size\": \"118.1MB\"},\n  {\"name\": \"Snipaste\", \"bundle_id\": \"com.Snipaste\", \"source\": \"App\", \"uninstall_name\": \"Snipaste\", \"path\": \"/Applications/Snipaste.app\", \"size\": \"97.4MB\"},\n  {\"name\": \"Steam\", \"bundle_id\": \"com.valvesoftware.steam\", \"source\": \"App\", \"uninstall_name\": \"Steam\", \"path\": \"/Applications/Steam.app\", \"size\": \"11.3MB\"},\n  {\"name\": \"Obsidian\", \"bundle_id\": \"md.obsidian\", \"source\": \"App\", \"uninstall_name\": \"Obsidian\", \"path\": \"/Applications/Obsidian.app\", \"size\": \"460.6MB\"},\n  {\"name\": \"Rectangle\", \"bundle_id\": \"com.knollsoft.Rectangle\", \"source\": \"App\", \"uninstall_name\": \"Rectangle\", \"path\": \"/Applications/Rectangle.app\", \"size\": \"7.4MB\"},\n  {\"name\": \"Google Chrome\", \"bundle_id\": \"com.google.Chrome\", \"source\": \"App\", \"uninstall_name\": \"Google Chrome\", \"path\": \"/Applications/Google Chrome.app\", \"size\": \"--\"},\n  {\"name\": \"Zotero\", \"bundle_id\": \"org.zotero.zotero\", \"source\": \"App\", \"uninstall_name\": \"Zotero\", \"path\": \"/Applications/Zotero.app\", \"size\": \"400.2MB\"},\n  {\"name\": \"百度网盘\", \"bundle_id\": \"com.baidu.BaiduNetdisk-mac\", \"source\": \"App\", \"uninstall_name\": \"百度网盘\", \"path\": \"/Applications/BaiduNetdisk_mac.app\", \"size\": \"837.1MB\"},\n  {\"name\": \"Postman\", \"bundle_id\": \"com.postmanlabs.mac\", \"source\": \"App\", \"uninstall_name\": \"Postman\", \"path\": \"/Applications/Postman.app\", \"size\": \"327.3MB\"},\n  {\"name\": \"QuPath-0.7.0-arm64\", \"bundle_id\": \"qupath\", \"source\": \"App\", \"uninstall_name\": \"QuPath-0.7.0-arm64\", \"path\": \"/Applications/QuPath-0.7.0-arm64.app\", \"size\": \"273.7MB\"},\n  {\"name\": \"飞书\", \"bundle_id\": \"com.electron.lark\", \"source\": \"App\", \"uninstall_name\": \"飞书\", \"path\": \"/Applications/Lark.app\", \"size\": \"--\"},\n  {\"name\": \"OneDrive\", \"bundle_id\": \"com.microsoft.OneDrive\", \"source\": \"App\", \"uninstall_name\": \"OneDrive\", \"path\": \"/Applications/OneDrive.app\", \"size\": \"--\"},\n  {\"name\": \"Microsoft OneNote\", \"bundle_id\": \"com.microsoft.onenote.mac\", \"source\": \"App\", \"uninstall_name\": \"Microsoft OneNote\", \"path\": \"/Applications/Microsoft OneNote.app\", \"size\": \"--\"},\n  {\"name\": \"Microsoft Excel\", \"bundle_id\": \"com.microsoft.Excel\", \"source\": \"App\", \"uninstall_name\": \"Microsoft Excel\", \"path\": \"/Applications/Microsoft Excel.app\", \"size\": \"--\"},\n  {\"name\": \"Microsoft Word\", \"bundle_id\": \"com.microsoft.Word\", \"source\": \"App\", \"uninstall_name\": \"Microsoft Word\", \"path\": \"/Applications/Microsoft Word.app\", \"size\": \"--\"},\n  {\"name\": \"Microsoft Outlook\", \"bundle_id\": \"com.microsoft.Outlook\", \"source\": \"App\", \"uninstall_name\": \"Microsoft Outlook\", \"path\": \"/Applications/Microsoft Outlook.app\", \"size\": \"2.88GB\"},\n  {\"name\": \"Microsoft PowerPoint\", \"bundle_id\": \"com.microsoft.Powerpoint\", \"source\": \"App\", \"uninstall_name\": \"Microsoft PowerPoint\", \"path\": \"/Applications/Microsoft PowerPoint.app\", \"size\": \"--\"},\n  {\"name\": \"Input Source Pro\", \"bundle_id\": \"com.runjuu.Input-Source-Pro\", \"source\": \"App\", \"uninstall_name\": \"Input Source Pro\", \"path\": \"/Applications/Input Source Pro.app\", \"size\": \"17.6MB\"},\n  {\"name\": \"Thunder\", \"bundle_id\": \"com.xunlei.Thunder\", \"source\": \"App\", \"uninstall_name\": \"Thunder\", \"path\": \"/Applications/Thunder.app\", \"size\": \"307.9MB\"},\n  {\"name\": \"Docker\", \"bundle_id\": \"com.docker.docker\", \"source\": \"App\", \"uninstall_name\": \"Docker\", \"path\": \"/Applications/Docker.app\", \"size\": \"2.24GB\"},\n  {\"name\": \"夸克网盘\", \"bundle_id\": \"com.quark.clouddrive.desktop\", \"source\": \"App\", \"uninstall_name\": \"夸克网盘\", \"path\": \"/Applications/QuarkCloudDrive.app\", \"size\": \"1.52GB\"},\n  {\"name\": \"UU远程\", \"bundle_id\": \"com.netease.uuremote\", \"source\": \"App\", \"uninstall_name\": \"UU远程\", \"path\": \"/Applications/UURemote.app\", \"size\": \"157.3MB\"},\n  {\"name\": \"抖音\", \"bundle_id\": \"com.bytedance.douyin.desktop\", \"source\": \"App\", \"uninstall_name\": \"抖音\", \"path\": \"/Applications/抖音.app\", \"size\": \"622.7MB\"},\n  {\"name\": \"网易有道翻译\", \"bundle_id\": \"com.youdao.YoudaoDict\", \"source\": \"App\", \"uninstall_name\": \"网易有道翻译\", \"path\": \"/Applications/网易有道翻译.app\", \"size\": \"209.9MB\"},\n  {\"name\": \"DevEco Testing for App\", \"bundle_id\": \"com.huawei.devecotesting.app\", \"source\": \"App\", \"uninstall_name\": \"DevEco Testing for App\", \"path\": \"/Applications/DevEco_Testing_for_App.app\", \"size\": \"839.2MB\"},\n  {\"name\": \"豆包\", \"bundle_id\": \"com.bot.neotix.doubao\", \"source\": \"App\", \"uninstall_name\": \"豆包\", \"path\": \"/Applications/豆包.app\", \"size\": \"--\"},\n  {\"name\": \"Code\", \"bundle_id\": \"com.microsoft.VSCode\", \"source\": \"App\", \"uninstall_name\": \"Code\", \"path\": \"/Applications/Visual Studio Code.app\", \"size\": \"1.53GB\"},\n  {\"name\": \"CC Switch\", \"bundle_id\": \"com.ccswitch.desktop\", \"source\": \"Homebrew\", \"uninstall_name\": \"cc-switch\", \"path\": \"/Applications/CC Switch.app\", \"size\": \"--\"},\n  {\"name\": \"ChatGPT\", \"bundle_id\": \"com.openai.codex\", \"source\": \"App\", \"uninstall_name\": \"ChatGPT\", \"path\": \"/Applications/ChatGPT.app\", \"size\": \"1.41GB\"},\n  {\"name\": \"LibreOffice\", \"bundle_id\": \"org.libreoffice.script\", \"source\": \"Homebrew\", \"uninstall_name\": \"libreoffice\", \"path\": \"/Applications/LibreOffice.app\", \"size\": \"843.4MB\"},\n  {\"name\": \"Stats\", \"bundle_id\": \"eu.exelban.Stats\", \"source\": \"Homebrew\", \"uninstall_name\": \"stats\", \"path\": \"/Applications/Stats.app\", \"size\": \"18.4MB\"},\n  {\"name\": \"鸿蒙星河互联\", \"bundle_id\": \"com.HarmonyOSInterconnection.app\", \"source\": \"App\", \"uninstall_name\": \"鸿蒙星河互联\", \"path\": \"/Applications/鸿蒙星河互联.app\", \"size\": \"--\"},\n  {\"name\": \"WPS Office\", \"bundle_id\": \"com.kingsoft.wpsoffice.mac\", \"source\": \"App\", \"uninstall_name\": \"WPS Office\", \"path\": \"/Applications/WPS Office.app\", \"size\": \"1.70GB\"},\n  {\"name\": \"WorkBuddy\", \"bundle_id\": \"com.tencent.workbuddy.mac\", \"source\": \"App\", \"uninstall_name\": \"WorkBuddy\", \"path\": \"/Applications/WorkBuddy.app\", \"size\": \"--\"},\n  {\"name\": \"腾讯会议\", \"bundle_id\": \"com.tencent.meeting\", \"source\": \"App\", \"uninstall_name\": \"腾讯会议\", \"path\": \"/Applications/TencentMeeting.app\", \"size\": \"--\"},\n  {\"name\": \"同花顺\", \"bundle_id\": \"cn.com.10jqka.macstockPro\", \"source\": \"App\", \"uninstall_name\": \"同花顺\", \"path\": \"/Applications/同花顺.app\", \"size\": \"--\"},\n  {\"name\": \"ima\", \"bundle_id\": \"com.tencent.imamac\", \"source\": \"App\", \"uninstall_name\": \"ima\", \"path\": \"/Applications/ima.copilot.app\", \"size\": \"--\"},\n  {\"name\": \"微信\", \"bundle_id\": \"com.tencent.xinWeChat\", \"source\": \"App\", \"uninstall_name\": \"微信\", \"path\": \"/Applications/WeChat.app\", \"size\": \"--\"},\n  {\"name\": \"Telegram\", \"bundle_id\": \"com.tdesktop.Telegram\", \"source\": \"App\", \"uninstall_name\": \"Telegram\", \"path\": \"/Applications/Telegram.app\", \"size\": \"--\"},\n  {\"name\": \"QQ\", \"bundle_id\": \"com.tencent.qq\", \"source\": \"App\", \"uninstall_name\": \"QQ\", \"path\": \"/Applications/QQ.app\", \"size\": \"1.42GB\"},\n  {\"name\": \"QQ音乐\", \"bundle_id\": \"com.tencent.QQMusicMac\", \"source\": \"App\", \"uninstall_name\": \"QQ音乐\", \"path\": \"/Applications/QQMusic.app\", \"size\": \"--\"},\n  {\"name\": \"iMovie 剪辑\", \"bundle_id\": \"com.apple.iMovieApp\", \"source\": \"App\", \"uninstall_name\": \"iMovie 剪辑\", \"path\": \"/Applications/iMovie.app\", \"size\": \"4.00GB\"},\n  {\"name\": \"IINA\", \"bundle_id\": \"com.colliderli.iina\", \"source\": \"App\", \"uninstall_name\": \"IINA\", \"path\": \"/Applications/IINA.app\", \"size\": \"--\"},\n  {\"name\": \"Clash Verge\", \"bundle_id\": \"io.github.clash-verge-rev.clash-verge-rev\", \"source\": \"App\", \"uninstall_name\": \"Clash Verge\", \"path\": \"/Applications/Clash Verge.app\", \"size\": \"213.2MB\"},\n  {\"name\": \"剪映专业版\", \"bundle_id\": \"com.lemon.lvpro\", \"source\": \"App\", \"uninstall_name\": \"剪映专业版\", \"path\": \"/Applications/剪映专业版.app\", \"size\": \"3.47GB\"},\n  {\"name\": \"MouseBoost\", \"bundle_id\": \"com.shrek.newterminal\", \"source\": \"App\", \"uninstall_name\": \"MouseBoost\", \"path\": \"/Applications/MouseBoost.app\", \"size\": \"--\"},\n  {\"name\": \"微信输入法\", \"bundle_id\": \"com.tencent.inputmethod.wetype\", \"source\": \"App\", \"uninstall_name\": \"微信输入法\", \"path\": \"/Library/Input Methods/WeType.app\", \"size\": \"--\"},\n  {\"name\": \"Logi Options+\", \"bundle_id\": \"com.logi.optionsplus\", \"source\": \"App\", \"uninstall_name\": \"Logi Options+\", \"path\": \"/Applications/logioptionsplus.app\", \"size\": \"543.4MB\"},\n  {\"name\": \"Logi Options+ Driver Installer\", \"bundle_id\": \"com.logi.optionsplus.driverhost\", \"source\": \"App\", \"uninstall_name\": \"Logi Options+ Driver Installer\", \"path\": \"/Applications/Utilities/Logi Options+ Driver Installer.bundle/Logi Options+ Driver Installer.app\", \"size\": \"--\"},\n  {\"name\": \"LogiPluginService\", \"bundle_id\": \"com.logi.pluginservice\", \"source\": \"App\", \"uninstall_name\": \"LogiPluginService\", \"path\": \"/Applications/Utilities/LogiPluginService.app\", \"size\": \"--\"},\n  {\"name\": \"Folo\", \"bundle_id\": \"is.follow\", \"source\": \"App\", \"uninstall_name\": \"Folo\", \"path\": \"/Applications/Folo.app\", \"size\": \"354.3MB\"},\n  {\"name\": \"DeepSeek Harness\", \"bundle_id\": \"com.deepseek.dsh\", \"source\": \"App\", \"uninstall_name\": \"DeepSeek Harness\", \"path\": \"/Applications/DeepSeek Harness.app\", \"size\": \"1.04GB\"}\n]\n","analyze":"{\n  \"scan_status\": \"complete\",\n  \"path\": \"/tmp/mole-gui-probe/sample\",\n  \"overview\": false,\n  \"entries\": [\n    {\n      \"scan_status\": \"complete\",\n      \"name\": \"a\",\n      \"path\": \"/tmp/mole-gui-probe/sample/a\",\n      \"size\": 1048576,\n      \"is_dir\": true\n    }\n  ],\n  \"large_files\": [\n    {\n      \"name\": \"big.bin\",\n      \"path\": \"/tmp/mole-gui-probe/sample/a/big.bin\",\n      \"size\": 1048576\n    }\n  ],\n  \"total_size\": 1048576,\n  \"total_files\": 1\n}\n","cleanPreview":"\nClean Your Mac\n\nDry Run Mode, Preview only, no deletions\n\n◎ System caches need sudo, run sudo -v && mo clean --dry-run for full preview\n\n⚙ Apple Silicon | Free space: 323.40GB\n✓ Whitelist: 19 core patterns active\n  ↳ /Users/example/Library/Caches/ms-playwright*\n  ↳ /Users/example/.gradle/caches/*\n  ↳ /Users/example/.gradle/daemon/*\n  ↳ /Users/example/.ollama/models/*\n  ↳ /Users/example/Library/Caches/com.nssurge.surge-mac/*\n  ↳ /Users/example/Library/Application Support/com.nssurge.surge-mac/*\n  ↳ /Users/example/Library/Caches/org.R-project.R/R/renv/*\n  ↳ /Users/example/Library/Caches/JetBrains*\n  ↳ /Users/example/Library/Caches/com.jetbrains.toolbox*\n  ↳ /Users/example/Library/Caches/tealdeer/tldr-pages\n  ↳ /Users/example/Library/Application Support/JetBrains*\n  ↳ /Users/example/Library/Caches/com.apple.finder\n  ↳ /Users/example/Library/Mobile Documents*\n  ↳ /Users/example/Library/Caches/com.apple.FontRegistry*\n  ↳ /Users/example/Library/Caches/com.apple.spotlight*\n  ↳ /Users/example/Library/Caches/com.apple.Spotlight*\n  ↳ /Users/example/Library/Caches/CloudKit*\n  ↳ /Users/example/Library/Caches/pypoetry/virtualenvs*\n\n➤ User essentials\n  → User app cache · 58 items, 8.87GB dry\n  → User app logs · 18 items, 24.5MB dry\n  ◎ Trash · skipped, grant Full Disk Access to your terminal\n\n➤ App caches\n  → Media analysis temp files · 4 items, 7.6MB dry\n  → Wallpaper aerials temp files · 6 items, 173.7MB dry\n  → Geod temp files · 237 items, 39.2MB dry\n  → macOS Help system cache · 5 items, 29.2MB dry\n  → Maps geo tile cache · 8 items, 89.8MB dry\n  → Apple Media Services temp files · 5 items, 7.2MB dry\n  → Apple Media Services cache · 6 items, 7.4MB dry\n  → Parsecd cache · 3 items, 172KB dry\n  → Apple Python cache · 3 items, 11.4MB dry\n  → Sandboxed app caches · 0B dry\n\n➤ Browsers\n  → Chrome cache · 1.98GB dry\n  → Chrome Service Worker, would clean 522.2MB, 0 protected\n  → GoogleUpdater CRX cache · 3 items, 784.0MB dry\n  → GoogleUpdater old files · 2 items, 2.1MB dry\n  → Puppeteer browser cache · 2 items, 1.46GB dry\n\n➤ Cloud & Office\n  → Microsoft Word temp files · 15 items, 8.1MB dry\n  → Microsoft Excel temp files · 2 items, 0B dry\n\n➤ Developer tools\n  → npm cache · would clean\n  → npm cache directory · 4 items, 30.34GB dry\n  → npm npx cache · 8 items, 1.36GB dry\n  → npm logs · 12 items, 15KB dry\n  → npm prebuilds · 3.6MB dry\n  → bun cache · would clean\n  → pip cache · would clean\n  → uv cache · would clean\n  → Go module cache · would clean\n  → Go build cache · would clean\n  ⊙ Docker unused data · review with docker system df\n  → GitHub CLI cache · would clean\n  → Oh My Zsh cache · 4 items, 3KB dry\n  → Python bytecode cache · ai-translator · 34 dirs, 2.3MB dry\n  → Python bytecode cache · ocr · 3 dirs, 66KB dry\n  → Python bytecode cache · anicatch · 1 dirs, 61KB dry\n  → Clang module cache · 64.3MB dry\n  → Sentry crash reports · 7 items, 29KB dry\n  → Qoder cache · 2 items, 979KB dry\n  → Qoder cached data · 5 items, 217.5MB dry\n  → Qoder extension cache · 8 items, 42.5MB dry\n  → Qoder code cache · 2 items, 16KB dry\n  → Qoder GPU cache · 5 items, 5.8MB dry\n  → Qoder Dawn cache · 5 items, 558KB dry\n  → Qoder WebGPU cache · 5 items, 558KB dry\n  → Qoder logs · 10 items, 23.9MB dry\n  → OpenCode cache · 4 items, 241.0MB dry\n  → Codex Desktop Cache · 2 items, 8.8MB dry\n  → Codex Desktop Code Cache · 2 items, 16KB dry\n  → Codex Desktop Cache · 2 items, 29KB dry\n  → Codex Desktop Code Cache · 2 items, 16KB dry\n  ⊙ Codex runtimes · manual review\n  ◎ Codex marketplace staging · skipped (open-file check unavailable)\n  → VS Code logs · 10 items, 16.3MB dry\n  → VS Code cache · 2 items, 27.4MB dry\n  → VS Code extension cache · 16 items, 209.9MB dry\n  → VS Code data cache · 6 items, 78.6MB dry\n  → VS Code webview cache · 21 items, 183.7MB dry\n  → Obsolete VS Code extension · 26.7MB dry\n  → Obsolete VS Code extension · 26.7MB dry\n  → Obsolete VS Code extension · 26.7MB dry\n  → Obsolete VS Code extension · 16.3MB dry\n  → Obsolete VS Code extension · 116.7MB dry\n  → Homebrew cache · 181 items, 1.40GB dry\n  → Homebrew cleanup · would free 1.5GB\n    ~/Library/Caches/Homebrew/ada-url--4.0.0 · 336.1KB\n    ~/Library/Caches/Homebrew/ada-url_bottle_manifest--4.0.0 · 25.3KB\n    ~/Library/Caches/Homebrew/c-ares--1.34.8 · 307.3KB\n    ~/Library/Caches/Homebrew/c-ares_bottle_manifest--1.34.8 · 14.9KB\n    ~/Library/Caches/Homebrew/ca-certificates--2026-08-13 · 112.2KB\n    ~/Library/Caches/Homebrew/ca-certificates_bottle_manifest--2026-08-13-1 · 11.9KB\n    ~/Library/Caches/Homebrew/certifi--2026.7.22 · 6.5KB\n    ~/Library/Caches/Homebrew/certifi_bottle_manifest--2026.7.22 · 14.7KB\n    ~/Library/Caches/Homebrew/cffi--2.1.1 · 353.8KB\n    ~/Library/Caches/Homebrew/cffi_bottle_manifest--2.1.1 · 32.8KB\n    ~/Library/Caches/Homebrew/dav1d--1.5.4 · 388.8KB\n    ~/Library/Caches/Homebrew/dav1d_bottle_manifest--1.5.4 · 15.0KB\n    ~/Library/Caches/Homebrew/deno--2.9.6 · 44MB\n    ~/Library/Caches/Homebrew/deno_bottle_manifest--2.9.6 · 101.4KB\n    ~/Library/Caches/Homebrew/ffmpeg--9.0.1_1 · 21.5MB\n    ~/Library/Caches/Homebrew/ffmpeg_bottle_manifest--9.0.1_1 · 214.1KB\n    ~/Library/Caches/Homebrew/fmt--12.2.0 · 288.4KB\n    ~/Library/Caches/Homebrew/fmt_bottle_manifest--12.2.0 · 7.3KB\n    ~/Library/Caches/Homebrew/fontconfig--2.18.3 · 451.6KB\n    ~/Library/Caches/Homebrew/fontconfig_bottle_manifest--2.18.3 · 56.3KB\n    ~/Library/Caches/Homebrew/fribidi--1.0.16 · 99.0KB\n    ~/Library/Caches/Homebrew/fribidi_bottle_manifest--1.0.16 · 10KB\n    ~/Library/Caches/Homebrew/gh--2.100.0 · 14MB\n    ~/Library/Caches/Homebrew/gh_bottle_manifest--2.100.0 · 14.9KB\n    ~/Library/Caches/Homebrew/giflib--6.1.3 · 143.2KB\n    ~/Library/Caches/Homebrew/giflib_bottle_manifest--6.1.3 · 7.7KB\n    ~/Library/Caches/Homebrew/glib--2.88.3 · 9.3MB\n    ~/Library/Caches/Homebrew/glib_bottle_manifest--2.88.3-1 · 85.7KB\n    ~/Library/Caches/Homebrew/gnupg--2.5.22 · 5.6MB\n    ~/Library/Caches/Homebrew/gnupg_bottle_manifest--2.5.22-1 · 161.9KB\n    ~/Library/Caches/Homebrew/gnutls--3.8.13_2 · 3MB\n    ~/Library/Caches/Homebrew/gnutls_bottle_manifest--3.8.13_2 · 16.6KB\n    ~/Library/Caches/Homebrew/go--1.27.1 · 67.6MB\n    ~/Library/Caches/Homebrew/go_bottle_manifest--1.27.1 · 15KB\n    ~/Library/Caches/Homebrew/gpgme--2.2.0 · 794.4KB\n    ~/Library/Caches/Homebrew/gpgme_bottle_manifest--2.2.0 · 183.7KB\n    ~/Library/Caches/Homebrew/gpgmepp--2.2.0 · 201.2KB\n    ~/Library/Caches/Homebrew/gpgmepp_bottle_manifest--2.2.0 · 189.5KB\n    ~/Library/Caches/Homebrew/graphite2--1.3.15 · 92.4KB\n    ~/Library/Caches/Homebrew/graphite2_bottle_manifest--1.3.15 · 8.0KB\n    ~/Library/Caches/Homebrew/harfbuzz--14.4.0 · 3.7MB\n    ~/Library/Caches/Homebrew/harfbuzz_bottle_manifest--14.4.0 · 197.3KB\n    ~/Library/Caches/Homebrew/hdrhistogram_c--0.11.10 · 43.6KB\n    ~/Library/Caches/Homebrew/hdrhistogram_c_bottle_manifest--0.11.10 · 7.8KB\n    ~/Library/Caches/Homebrew/jpeg-turbo--3.2.0 · 1.3MB\n    ~/Library/Caches/Homebrew/jpeg-turbo_bottle_manifest--3.2.0 · 8.3KB\n    ~/Library/Caches/Homebrew/json-c--0.19 · 106.9KB\n    ~/Library/Caches/Homebrew/json-c_bottle_manifest--0.19 · 7.2KB\n    ~/Library/Caches/Homebrew/lame--4.0 · 663.8KB\n    ~/Library/Caches/Homebrew/lame_bottle_manifest--4.0 · 23KB\n    ~/Library/Caches/Homebrew/leptonica--1.87.0 · 2.7MB\n    ~/Library/Caches/Homebrew/leptonica_bottle_manifest--1.87.0-1 · 17.3KB\n    ~/Library/Caches/Homebrew/libarchive--3.8.9 · 1.6MB\n    ~/Library/Caches/Homebrew/libarchive_bottle_manifest--3.8.9 · 52.2KB\n    ~/Library/Caches/Homebrew/libb2--0.98.1 · 36.6KB\n    ~/Library/Caches/Homebrew/libb2_bottle_manifest--0.98.1 · 15.3KB\n    ~/Library/Caches/Homebrew/libdatrie--0.2.14 · 70.5KB\n    ~/Library/Caches/Homebrew/libdatrie_bottle_manifest--0.2.14 · 7.8KB\n    ~/Library/Caches/Homebrew/libffi--3.8.0 · 271.0KB\n    ~/Library/Caches/Homebrew/libffi_bottle_manifest--3.8.0 · 16.9KB\n    ~/Library/Caches/Homebrew/libgcrypt--1.12.4 · 1.5MB\n    ~/Library/Caches/Homebrew/libgcrypt_bottle_manifest--1.12.4 · 28.5KB\n    ~/Library/Caches/Homebrew/libgpg-error--1.61 · 581.6KB\n    ~/Library/Caches/Homebrew/libgpg-error_bottle_manifest--1.61 · 9.5KB\n    ~/Library/Caches/Homebrew/libksba--1.8.1 · 182.6KB\n    ~/Library/Caches/Homebrew/libksba_bottle_manifest--1.8.1 · 41KB\n    ~/Library/Caches/Homebrew/libnghttp2--1.70.0 · 234.6KB\n    ~/Library/Caches/Homebrew/libnghttp2_bottle_manifest--1.70.0 · 17.1KB\n    ~/Library/Caches/Homebrew/libnghttp3--1.18.0 · 189.5KB\n    ~/Library/Caches/Homebrew/libnghttp3_bottle_manifest--1.18.0 · 14.8KB\n    ~/Library/Caches/Homebrew/libngtcp2--1.25.0 · 426.7KB\n    ~/Library/Caches/Homebrew/libngtcp2_bottle_manifest--1.25.0 · 32.3KB\n    ~/Library/Caches/Homebrew/libpng--1.6.58 · 459.8KB\n    ~/Library/Caches/Homebrew/libpng_bottle_manifest--1.6.58 · 8.6KB\n    ~/Library/Caches/Homebrew/libthai--0.1.30 · 277.4KB\n    ~/Library/Caches/Homebrew/libthai_bottle_manifest--0.1.30 · 8.2KB\n    ~/Library/Caches/Homebrew/libtiff--4.7.2 · 2.0MB\n    ~/Library/Caches/Homebrew/libtiff_bottle_manifest--4.7.2-1 · 61.8KB\n    ~/Library/Caches/Homebrew/libusb--1.0.30 · 192.2KB\n    ~/Library/Caches/Homebrew/libusb_bottle_manifest--1.0.30 · 15.0KB\n    ~/Library/Caches/Homebrew/libvmaf--3.2.0 · 1.2MB\n    ~/Library/Caches/Homebrew/libvmaf_bottle_manifest--3.2.0 · 7.7KB\n    ~/Library/Caches/Homebrew/libvpx--1.17.0 · 1.9MB\n    ~/Library/Caches/Homebrew/libvpx_bottle_manifest--1.17.0 · 17.5KB\n    ~/Library/Caches/Homebrew/little-cms2--2.19.1 · 432.8KB\n    ~/Library/Caches/Homebrew/little-cms2_bottle_manifest--2.19.1-1 · 67KB\n    ~/Library/Caches/Homebrew/llhttp--9.4.3 · 38.3KB\n    ~/Library/Caches/Homebrew/llhttp_bottle_manifest--9.4.3 · 16.9KB\n    ~/Library/Caches/Homebrew/merve--1.2.2_2 · 33KB\n    ~/Library/Caches/Homebrew/merve_bottle_manifest--1.2.2_2 · 32.2KB\n    ~/Library/Caches/Homebrew/mole--1.53.0 · 4MB\n    ~/Library/Caches/Homebrew/mole_bottle_manifest--1.53.0-1 (11.4KB)Warning: Skipping node: most recent version 26.12.0 not installed\n    ~/Library/Caches/Homebrew/mpg123--1.33.7 · 648.6KB\n    ~/Library/Caches/Homebrew/mpg123_bottle_manifest--1.33.7 · 18.4KB\n    ~/Library/Caches/Homebrew/nbytes--0.1.4 · 13.3KB\n    ~/Library/Caches/Homebrew/nbytes_bottle_manifest--0.1.4 · 7.3KB\n    ~/Library/Caches/Homebrew/nettle--4.0 · 990.8KB\n    ~/Library/Caches/Homebrew/nettle_bottle_manifest--4.0 · 9.4KB\n    ~/Library/Caches/Homebrew/node--26.8.2 · 19.8MB\n    ~/Library/Caches/Homebrew/node_bottle_manifest--26.8.2 · 176.9KB\n    ~/Library/Caches/Homebrew/nspr--4.40 · 330.9KB\n    ~/Library/Caches/Homebrew/nspr_bottle_manifest--4.40 · 17.4KB\n    ~/Library/Caches/Homebrew/nss--3.129 · 6.2MB\n    ~/Library/Caches/Homebrew/nss_bottle_manifest--3.129 · 41.6KB\n    ~/Library/Caches/Homebrew/openssl@3--3.6.4 · 11.0MB\n    ~/Library/Caches/Homebrew/openssl@3_bottle_manifest--3.6.4 · 24KB\n    ~/Library/Caches/Homebrew/p11-kit--0.26.5 · 993.7KB\n    ~/Library/Caches/Homebrew/p11-kit_bottle_manifest--0.26.5 · 35.0KB\n    ~/Library/Caches/Homebrew/pango--1.58.2 · 900.5KB\n    ~/Library/Caches/Homebrew/pango_bottle_manifest--1.58.2 · 220.7KB\n    ~/Library/Caches/Homebrew/pcre2--10.48 · 2.5MB\n    ~/Library/Caches/Homebrew/pcre2_bottle_manifest--10.48 · 21.2KB\n    ~/Library/Caches/Homebrew/pinentry--1.3.3 · 135KB\n    ~/Library/Caches/Homebrew/pinentry_bottle_manifest--1.3.3 · 18.5KB\n    ~/Library/Caches/Homebrew/poppler--26.09.0 · 9.9MB\n    ~/Library/Caches/Homebrew/poppler_bottle_manifest--26.09.0 · 379.9KB\n    ~/Library/Caches/Homebrew/pycparser--3.0 · 103.8KB\n    ~/Library/Caches/Homebrew/pycparser_bottle_manifest--3.0 · 2.0KB\n    ~/Library/Caches/Homebrew/python@3.14--3.14.7 · 19.2MB\n    ~/Library/Caches/Homebrew/python@3.14_bottle_manifest--3.14.7 · 128.4KB\n    ~/Library/Caches/Homebrew/ripgrep--15.2.0 · 2.1MB\n    ~/Library/Caches/Homebrew/ripgrep_bottle_manifest--15.2.0 · 25.0KB\n    ~/Library/Caches/Homebrew/rtk--0.49.0 · 3.4MB\n    ~/Library/Caches/Homebrew/rtk_bottle_manifest--0.49.0 · 12.7KB\n    ~/Library/Caches/Homebrew/sdl2-compat--2.32.72 · 638KB\n    ~/Library/Caches/Homebrew/sdl2-compat_bottle_manifest--2.32.72 · 118.5KB\n    ~/Library/Caches/Homebrew/sdl3--3.4.16 · 1.6MB\n    ~/Library/Caches/Homebrew/sdl3_bottle_manifest--3.4.16 · 111KB\n    ~/Library/Caches/Homebrew/simdjson--4.6.11 · 1.5MB\n    ~/Library/Caches/Homebrew/simdjson_bottle_manifest--4.6.11 · 16.2KB\n    ~/Library/Caches/Homebrew/simdutf--9.1.2 · 395.9KB\n    ~/Library/Caches/Homebrew/simdutf_bottle_manifest--9.1.2 · 19.6KB\n    ~/Library/Caches/Homebrew/sqlite--3.53.4 · 2.5MB\n    ~/Library/Caches/Homebrew/sqlite_bottle_manifest--3.53.4 · 32.0KB\n    ~/Library/Caches/Homebrew/summarize--0.21.13 · 25.6MB\n    ~/Library/Caches/Homebrew/summarize_bottle_manifest--0.21.13 · 399.7KB\n    ~/Library/Caches/Homebrew/svt-av1--4.2.0 · 1.4MB\n    ~/Library/Caches/Homebrew/svt-av1_bottle_manifest--4.2.0 · 15KB\n    ~/Library/Caches/Homebrew/tesseract--5.5.3 · 13.2MB\n    ~/Library/Caches/Homebrew/tesseract_bottle_manifest--5.5.3 · 269.4KB\n    ~/Library/Caches/Homebrew/topgrade--17.10.1 · 2.6MB\n    ~/Library/Caches/Homebrew/topgrade_bottle_manifest--17.10.1 · 13.0KB\n    ~/Library/Caches/Homebrew/uv--0.12.13 · 18.5MB\n    ~/Library/Caches/Homebrew/uv_bottle_manifest--0.12.13 · 19.1KB\n    ~/Library/Caches/Homebrew/webp--1.6.0 · 901.9KB\n    ~/Library/Caches/Homebrew/webp_bottle_manifest--1.6.0 · 19.5KB\n    ~/Library/Caches/Homebrew/x265--4.3 · 5.3MB\n    ~/Library/Caches/Homebrew/x265_bottle_manifest--4.3 · 18.7KB\n    ~/Library/Caches/Homebrew/yt-dlp--2026.8.19_1 · 8.1MB\n    ~/Library/Caches/Homebrew/yt-dlp_bottle_manifest--2026.8.19_1-2 · 153.6KB\n    ~/Library/Caches/Homebrew/unbound_bottle_manifest--1.25.2 · 44.8KB\n    ~/Library/Caches/Homebrew/descriptions.json · 503KB\n    ~/Library/Caches/Homebrew/gifgrep--0.3.0.tar.gz · 3.3MB\n    ~/Library/Caches/Homebrew/cask_descriptions.json · 475.5KB\n    ~/Library/Caches/Homebrew/numpy_bottle_manifest--2.5.1 · 18.4KB\n    ~/Library/Caches/Homebrew/gcc_bottle_manifest--16.1.0-2 · 24.7KB\n    ~/Library/Caches/Homebrew/openblas_bottle_manifest--0.3.34 · 72KB\n    ~/Library/Caches/Homebrew/fzf_bottle_manifest--0.74.1 · 16.8KB\n    ~/Library/Caches/Homebrew/external_commands_list.txt · 1B\n    ~/Library/Caches/Homebrew/linkage.json · 140.6KB\n    ~/Library/Caches/Homebrew/remindctl--0.2.0.zip · 476.4KB\n    ~/Library/Caches/Homebrew/isl_bottle_manifest--0.28 · 10.6KB\n    ~/Library/Caches/Homebrew/imsg--0.8.2.zip · 2.3MB\n    ~/Library/Caches/Homebrew/openai-whisper_bottle_manifest--20250625_5 · 59.3KB\n    ~/Library/Caches/Homebrew/protobuf_bottle_manifest--35.1 · 10.7KB\n    ~/Library/Caches/Homebrew/libevent--2.1.13 · 723.6KB\n    ~/Library/Caches/Homebrew/all_commands_list.txt · 1KB\n    ~/Library/Caches/Homebrew/pytorch_bottle_manifest--2.13.0-1 · 134.2KB\n    ~/Library/Caches/Homebrew/libomp_bottle_manifest--22.1.8 · 12.4KB\n    ~/Library/Caches/Homebrew/openblas--0.3.34 · 14MB\n    ~/Library/Caches/Homebrew/onnx_bottle_manifest--1.22.0 · 9.6KB\n    ~/Library/Caches/Homebrew/python@3.13_bottle_manifest--3.13.14_1-1 · 91.3KB\n    ~/Library/Caches/Homebrew/pybind11_bottle_manifest--3.0.4 · 2.2KB\n    ~/Library/Caches/Homebrew/isl--0.28 · 1.7MB\n    ~/Library/Caches/Homebrew/libevent_bottle_manifest--2.1.13 · 10.7KB\n    ~/Library/Caches/Homebrew/Cask/CC-Switch-v3.14.1-macOS.dmg--3.14.1.dmg · 24.5MB\n    ~/Library/Caches/Homebrew/Cask/xurl_Darwin_arm64.tar.gz--1.1.1.tar.gz · 4.9MB\n    ~/Library/Caches/Homebrew/Cask/libreoffice--26.8.0.dmg · 298.8MB\n    ~/Library/Caches/Homebrew/Cask/stats--3.0.15.dmg · 7.6MB\n    ~/Library/Caches/Homebrew/Cask/ngrok--3.39.11,dy27whJwwmb,a.zip · 11.3MB\n    ~/Library/Caches/Homebrew/Cask/ngrok-v3-3.39.8-darwin-arm64.zip--3.39.8,npvVigbewP5,a.zip · 11.0MB\n    ~/Library/Caches/Homebrew/Cask/ngrok-v3-3.39.1-darwin-arm64.zip--3.39.1,ibTLJJL6E5Z,a.zip · 10.9MB\n    ~/Library/Caches/Homebrew/Cask/cc-switch--3.20.3.dmg · 28.2MB\n    ~/Library/Caches/Homebrew/Cask/LibreOffice_26.2.4_MacOS_aarch64.dmg--26.2.4.dmg · 295MB\n    ~/Library/Caches/Homebrew/Cask/LibreOffice_26.2.3_MacOS_aarch64.dmg--26.2.3.dmg · 295MB\n    ~/Library/Caches/Homebrew/Cask/CC-Switch-v3.16.3-macOS.dmg--3.16.3.dmg · 33.2MB\n    ~/Library/Logs/Homebrew/python@3.14 · 64B\n    ~/Library/Logs/Homebrew/fontconfig · 64B\n    ~/Library/Logs/Homebrew/node · 64B\n    /opt/homebrew/Library/Homebrew/vendor/portable-ruby/4.0.3 · 34.6MB\n    /opt/homebrew/Library/Homebrew/vendor/portable-ruby/4.0.5_1 · 34.6MB\n\n➤ Apps & utilities\n  → Feishu Service Worker, would clean 566.9MB, 0 protected\n  → WeChat logs · 36 items, 219.0MB dry\n  → JianyingPro generated cache · 6 items, 2.6MB dry\n  → Podcasts streamed media · 0B dry\n  → Podcasts artwork cache · 456 items, 11.0MB dry\n  → Podcasts image cache · 29 items, 1.0MB dry\n  → Podcasts download temp · 105 items, 1.0MB dry\n  → QQ Music streaming cache · 141 items, 134.9MB dry\n  → QQ Music logs · 14 items, 17.2MB dry\n  → QQ Music cache · 2 items, 2.5MB dry\n  → QQ Music temp files · 7 items, 322KB dry\n  → Steam app cache · 4 items, 46.4MB dry\n  → Steam logs · 34 items, 343KB dry\n  → Zsh completion cache · 2 items, 168KB dry\n  → Ghostty cache · 4KB dry\n  → Input Source Pro cache · 2 items, 713KB dry\n  → WeType dict update cache · 181.1MB dry\n\n➤ Virtualization\n  ✓ Nothing to clean\n\n➤ Application Support\n  → Application Support logs/caches · at least 986.7MB dry\n\n➤ App leftovers\n  → Orphaned Caches: com.github.wasilibs · 2.6MB dry\n  → Orphaned Caches: com.mitchellh.ghostty · 4KB dry\n  → Orphaned Caches: com.oray.sunlogin.macclient · 4.6MB dry\n  → Orphaned Caches: com.qoder.ide.ShipIt · 16KB dry\n  → Orphaned Caches: io.sentry · 12KB dry\n  → Would clean 9 items, about 16.2MB\n\n➤ Apple Silicon updates\n  ✓ Nothing to clean\n\n➤ Device backups & firmware\n  ✓ Nothing to clean\n\n➤ Time Machine\n  ✓ Nothing to clean\n\n➤ Large files\n  ⊙ Docker Desktop data · 27.84GB · ~/Library/Containers/com.docker.docker/Data\n\n➤ Project artifacts\n  ✓ Nothing to clean\n\n\n======================================================================\nDry run complete - no changes made\nPotential space: 46.83GB+ | Items: 1681 | Categories: 7\nDetailed file list: /Users/example/.config/mole/clean-list.txt\nUse mo clean --whitelist to add protection rules\n======================================================================\n\n","optimizePreview":"\nOptimize\n→ DRY RUN MODE, No files will be modified\n\n⚙ System  17/32 GB RAM | 580/926 GB Disk | Uptime 19d\n\nPerformance diagnosis\n  ✓ No sustained high-CPU bottleneck detected\n\n➤ Finder Cache Refresh\n  → QuickLook thumbnails refreshed\n  → Icon services cache rebuilt\n\n➤ App State Cleanup\n  → App saved states optimized\n\n➤ Broken Config Repair\n  → All preference files valid\n\n➤ Network Cache Refresh\n  → DNS cache refreshed\n\n➤ Database Optimization\n  ◎ Close these apps before database optimization: Mail\n\n➤ Prevent Finder .DS_Store\n  → .DS_Store prevention already enabled on network & USB volumes\n\n➤ Legacy Overrides\n  → No legacy App Nap or disk-image overrides found\n\n➤ Network Stack Refresh\n  → Network stack already optimal\n\n➤ Permission Repair\n  → User directory permissions already optimal\n\n➤ Spotlight Optimization\n  → Spotlight index already optimal\n\n➤ Spotlight Orphan Rules\n  → Spotlight search rules already clean\n\n➤ Periodic Maintenance\n  → Periodic maintenance skipped (not available on this macOS version)\n\n➤ Shared File Lists\n  - Shared file lists not readable (check directory permissions and Full Disk Access)\n\n➤ Disk Health\n  → Disk verify skipped\n\n➤ Login Items\n  → Login items audit · skipped in test mode\n\n➤ Quarantine Database Cleanup\n  → Quarantine database already clean\n\n➤ Launch Agents Cleanup\n  → Launch Agents all healthy\n\n➤ Notifications\n  → Notification Center database is healthy (561KB)\n\n➤ Usage Data\n  → Knowledge database is healthy (6.4MB)\n\n======================================================================\nDry Run Complete, No Changes Made\nWould apply 2 optimizations\n12 unchanged | 3 skipped | 2 unavailable\nRun without --dry-run to apply these changes\n======================================================================\n\n","purgePreview":"→ DRY RUN MODE, No project artifacts will be removed\n\nPurge Project Artifacts\n\n✓ Great! No old project artifacts to clean\n\n","version":"\nMole version 1.61.0\nmacOS: 26.6.2\nArchitecture: arm64\nKernel: 25.6.0\nSIP: Enabled\nDisk Free: 326.22GB\nInstall: Manual\nShell: /bin/zsh\n\n","uninstallDryRun":"→ DRY RUN MODE, No app files or settings will be modified\n\n◎ Matched 1 app(s):\n1. Rectangle  7.4MB  |  Last: 1m ago\n\n\nFiles to be removed:\n◎ Rectangle , 7.4MB\n  ✓ /Applications/Rectangle.app , 7.4MB\n  ✓ ~/Library/Caches/com.knollsoft.Rectangle , 4KB\n\nPersonal data kept:\n  ⊙ ~/Library/WebKit/com.knollsoft.Rectangle\n  ⊙ ~/Library/HTTPStorages/com.knollsoft.Rectangle\n  ⊙ /var/folders/xx/example/C/C/com.knollsoft.Rectangle\n  ⊙ ~/Library/Preferences/com.knollsoft.Rectangle.plist\n\nD choose personal data\n➤ Remove 1 app, 7.4MB [Running]  Enter confirm, ESC cancel: \n\n======================================================================\nUninstall dry run complete\nWould remove 1 app, would free 7.4MB: Rectangle\n======================================================================\n\n[DRY RUN] Would refresh LaunchServices and update Dock entries\n","purgePreviewArtifacts":"→ DRY RUN MODE, No project artifacts will be removed\n\nPurge Project Artifacts\n\n✓ [DRY RUN] /Users/example/projects/demo/node_modules, 2.1MB\n✓ [DRY RUN] /Users/example/projects/demo/dist, 524KB\n\n\n======================================================================\nDry run complete - no changes made\nWould free approximately: 2.6MB | Items: 2 | Free: 327.14GB\n======================================================================\n\n","purgeRunComplete":"Purge Project Artifacts\n\n\n\n======================================================================\nPurge complete\nEstimated space freed: 2.6MB | Items: 2 | Free: 327.13GB\n======================================================================\n\n"};

  var params = new URLSearchParams(window.location.search);
  var ACTIVE = params.get('mock') === '1' || window.__MOLE_MOCK__ === true || window.__MOLE_MOCK_SCREEN__ != null;
  if (!ACTIVE) return;

  var SCREEN = params.get('screen') || window.__MOLE_MOCK_SCREEN__ || 'dashboard';
  var SCENARIO = params.get('scenario') || window.__MOLE_MOCK_SCENARIO__ || 'default';

  var VERSION = parseVersionFixture(FIXTURES.version);
  var APP = { version: '1.0.0', build: '1' };
  var HOME = '/Users/example';
  var PATHS = {
    logs: HOME + '/Library/Logs/mole',
    config: HOME + '/.config/mole',
    appSupport: HOME + '/Library/Application Support/mole',
    downloads: HOME + '/Downloads',
    applications: '/Applications'
  };
  var BUNDLED_CLI = '/Applications/Mole GUI.app/Contents/Resources/mole-runtime/mole';

  var CONFIG_KEY = 'mole.mock.config.v1';
  var config = loadConfig() || {
    cliPath: BUNDLED_CLI,
    lastScreen: SCREEN || 'dashboard',
    welcomeSeen: false
  };
  if (!config.lastScreen) config.lastScreen = SCREEN || 'dashboard';

  var initialCli = {
    path: BUNDLED_CLI,
    version: SCENARIO === 'cli-missing' ? '' : VERSION.version,
    source: 'bundled',
    ok: SCENARIO !== 'cli-missing',
    error: SCENARIO === 'cli-missing' ? '捆绑的 Mole CLI 未找到或不可执行' : ''
  };
  var cli = clone(initialCli);
  var appVersion = VERSION.version;

  var jobs = Object.create(null);
  var settleTimer = null;
  var forceSettleTimer = null;

  // ------------------------------------------------------------- utilities

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emit(event) {
    try {
      window.__moleNative(JSON.stringify(event));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MoleMock] emit failed', error);
    }
  }

  function toast(message, tone) {
    emit({ type: 'toast', message: message, tone: tone || 'info' });
  }

  function parseVersionFixture(text) {
    var version = { version: '', os: '', arch: '' };
    String(text || '')
      .split('\n')
      .forEach(function (line) {
        var m = line.trim().match(/^Mole version\s+(.+)$/i);
        if (m) version.version = m[1].trim();
        m = line.trim().match(/^macOS:\s*(.+)$/i);
        if (m) version.os = m[1].trim();
        m = line.trim().match(/^Architecture:\s*(.+)$/i);
        if (m) version.arch = m[1].trim();
      });
    return version;
  }

  function loadConfig() {
    try {
      var raw = window.localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveConfig() {
    try {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      /* file:// localStorage may be unavailable; in-memory config still works */
    }
  }

  function markSettled() {
    window.__moleSnapshotReady = true;
    document.documentElement.dataset.snapshot = 'ready';
  }

  function activeCount() {
    return Object.keys(jobs).length;
  }

  function scheduleSettled(delay) {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(function () {
      if (activeCount() === 0) markSettled();
    }, delay || 400);
  }

  function scheduleForcedSettle() {
    window.clearTimeout(forceSettleTimer);
   forceSettleTimer = window.setTimeout(markSettled, 2600);
  }

  // -------------------------------------------------------------- fixtures

  var APP_LIST = [];
  try {
    APP_LIST = JSON.parse(FIXTURES.apps);
  } catch (error) {
    APP_LIST = [];
  }

  function historyForScenario() {
    if (SCENARIO === 'empty') {
      return JSON.stringify({ logs: { operations: PATHS.logs + '/operations.log', deletions: PATHS.logs + '/deletions.log' }, limit: 100, sessions: [], deletions: [] }, null, 2);
    }
    return FIXTURES.history;
  }

  function analyzeForScenario() {
    if (SCENARIO === 'empty') {
      return JSON.stringify(
        {
          scan_status: 'complete',
          path: HOME + '/Downloads',
          overview: false,
          entries: [],
          large_files: [],
          total_size: 0,
          total_files: 0
        },
        null,
        2
      );
    }
    return FIXTURES.analyze;
  }

  function statusForScenario() {
    return FIXTURES.status;
  }

  function selectedApps(args) {
    var names = args.slice(1).filter(function (arg) {
      return arg.charAt(0) !== '-';
    });
    var selected = APP_LIST.filter(function (app) {
      return names.indexOf(app.uninstall_name) >= 0 || names.indexOf(app.name) >= 0;
    });
    if (!selected.length) selected = APP_LIST.slice(0, 2);
    return selected;
  }

  function appSize(app) {
    return app.size && app.size !== '--' ? app.size : 'N/A';
  }

  function buildUninstallPreview(args) {
    var apps = selectedApps(args);
    var total = apps.length === 1 ? '728.0MB' : '1.16GB';
    var names = apps.map(function (app) { return app.name; }).join(', ');
    var out = ['→ DRY RUN MODE, No app files or settings will be modified', ''];
    out.push('◎ Matched ' + apps.length + ' app(s):');
    apps.forEach(function (app, index) {
      out.push((index + 1) + '. ' + app.uninstall_name + '  ' + appSize(app) + '  |  Last: 1m ago');
    });
    out.push('');
    out.push('Files to be removed:');
    apps.forEach(function (app) {
      var bundle = app.bundle_id || 'com.example.' + app.name;
      out.push('◎ ' + app.uninstall_name + ' , ' + appSize(app));
      out.push('  ✓ /Applications/' + app.name + '.app , ' + appSize(app));
      out.push('  ✓ ' + HOME + '/Library/Caches/' + bundle + ' , 42.5MB');
      out.push('  ✓ ' + HOME + '/Library/Preferences/' + bundle + '.plist , 16KB');
      out.push('  ✓ ' + HOME + '/Library/Application Support/' + app.name + ' , 120.5MB');
      out.push('  System: /Library/Application Support/' + app.name + ' , 12.0MB');
    });
    out.push('');
    out.push('Personal data kept:');
    out.push('  ⊙ ' + HOME + '/Library/WebKit/' + (apps[0].bundle_id || 'com.example.app'));
    out.push('  ⊙ ' + HOME + '/Documents/' + apps[0].name + ' Vault');
    out.push('');
    out.push('D choose personal data');
    out.push('➤ Remove ' + apps.length + ' app' + (apps.length === 1 ? '' : 's') + ', ' + total + ' [Running]  Enter confirm, ESC cancel: ');
    out.push('');
    out.push('======================================================================');
    out.push('Uninstall dry run complete');
    out.push('Would remove ' + apps.length + ' app' + (apps.length === 1 ? '' : 's') + ', would free ' + total + ': ' + names);
    out.push('======================================================================');
    out.push('');
    out.push('[DRY RUN] Would refresh LaunchServices and update Dock entries');
    return out.join('\n');
  }


  function buildUninstallRun(args) {
    var apps = selectedApps(args);
    var out = ['Uninstall', ''];
    apps.forEach(function (app) {
      out.push('→ Removing ' + app.uninstall_name);
      out.push('  ✓ Moved /Applications/' + app.name + '.app to Trash');
      out.push('  ✓ Removed 12 leftover files · 42.5MB');
      out.push('  ✓ Unloaded Launch Services registration');
      out.push('  ✓ Removed login item');
      out.push('');
    });
    out.push('# ============================================');
    out.push('Uninstall Complete');
    out.push('Removed ' + apps.length + ' app' + (apps.length === 1 ? '' : 's') + ' · ' + (apps.length === 1 ? '728.0MB' : '1.16GB'));
    out.push('Moved to Trash: /Applications/' + apps[0].name + '.app');
    out.push('# ============================================');
    out.push('');
    out.push('EXIT=0');
    return out.join('\n');
  }

  function buildCleanRun() {
    return [
      'Clean Your Mac',
      '',
      '✓ Whitelist: 19 core patterns active',
      '',
      '➤ User essentials',
      '  ✓ User app cache · 8.87GB cleaned, 58 items',
      '  ✓ User app logs · 24.5MB cleaned, 18 items',
      '  ◎ Trash · skipped, grant Full Disk Access to your terminal',
      '',
      '➤ App caches',
      '  ✓ Media analysis temp files · 7.6MB cleaned, 4 items',
      '  ✓ Wallpaper aerials temp files · 173.7MB cleaned, 6 items',
      '  ✓ Geod temp files · 39.2MB cleaned, 237 items',
      '  ✓ Maps geo tile cache · 89.8MB cleaned, 8 items',
      '',
      '➤ Browsers',
      '  ✓ Chrome cache · 1.98GB cleaned',
      '  ✓ Chrome Service Worker · 522.2MB cleaned, 0 protected',
      '  ✓ Puppeteer browser cache · 1.46GB cleaned, 2 items',
      '',
      '➤ Developer tools',
      '  ✓ npm cache directory · 30.34GB cleaned, 4 items',
      '  ✓ npm npx cache · 1.36GB cleaned, 8 items',
      '  ✓ Homebrew cache · 1.40GB cleaned, 181 items',
      '  ✓ VS Code extension cache · 209.9MB cleaned, 16 items',
      '',
      '➤ Apps & utilities',
      '  ✓ WeChat logs · 219.0MB cleaned, 36 items',
      '  ✓ QQ Music streaming cache · 134.9MB cleaned, 141 items',
      '',
      '➤ App leftovers',
      '  ✓ Orphaned Caches: com.github.wasilibs · 2.6MB cleaned',
      '  ✓ Orphaned Caches: com.oray.sunlogin.macclient · 4.6MB cleaned',
      '',
      '======================================================================',
      'Cleanup Complete',
      'Tracked cleanup: 46.83GB',
      'Items cleaned: 1681',
      'Free space: 370.23GB (+46.83GB)',
      '======================================================================',
      '',
      'EXIT=0'
    ].join('\n');
  }

  function buildOptimizeRun() {
    return [
      'Optimize',
      '→ Applying maintenance tasks',
      '',
      '➤ Finder Cache Refresh',
      '  ✓ QuickLook thumbnails refreshed',
      '  ✓ Icon services cache rebuilt',
      '',
      '➤ App State Cleanup',
      '  ✓ App saved states optimized',
      '',
      '➤ Broken Config Repair',
      '  ✓ All preference files valid',
      '',
      '➤ Network Cache Refresh',
      '  ✓ DNS cache refreshed',
      '',
      '➤ Database Optimization',
      '  ◎ Close these apps before database optimization: Mail',
      '',
      '➤ Spotlight Optimization',
      '  ✓ Spotlight index already optimal',
      '',
      '======================================================================',
      'Optimize Complete',
      'Applied 2 optimizations',
      '12 unchanged | 3 skipped | 2 unavailable',
      '======================================================================',
      '',
      'EXIT=0'
    ].join('\n');
  }

  function buildPurgeRun() {
    return [
      'Purge Project Artifacts',
      '→ Scanning project directories',
      '',
      '➤ Project artifacts',
      '  → ~/code/demo-app/node_modules · 1.20GB',
      '  → ~/code/old-site/.next · 640MB',
      '  ✓ Removed 2 artifacts · 1.82GB',
      '',
      '======================================================================',
      'Purge Complete',
      'Freed 1.82GB',
      '======================================================================',
      '',
      'EXIT=0'
    ].join('\n');
  }

  function buildGeneric(args) {
    return ['→ DRY RUN MODE', '', 'Running: mole ' + args.join(' '), '', 'EXIT=0'].join('\n');
  }

  function route(args) {
    var command = args[0] || '';
    var dryRun = args.indexOf('--dry-run') >= 0 || args.indexOf('-n') >= 0;
    if (command === '--version' || command === 'version' || command === '-v') {
      return { text: FIXTURES.version, stream: 'stdout', code: 0 };
    }
    if (command === 'status') {
      if (SCENARIO === 'loading') return { text: FIXTURES.status, stream: 'stdout', code: 0, hold: true };
      if (SCENARIO === 'error') {
        return {
          text: FIXTURES.status,
          stream: 'stdout',
          code: 1,
          stderr: '✗ status failed: permission denied while reading system metrics\n',
          forceError: true
        };
      }
      return { text: statusForScenario(), stream: 'stdout', code: 0 };
    }
    if (command === 'history') {
      return { text: historyForScenario(), stream: 'stdout', code: 0 };
    }
    if (command === 'analyze' || command === 'analyse') {
      return { text: analyzeForScenario(), stream: 'stdout', code: 0 };
    }
    if (command === 'uninstall') {
      if (args.indexOf('--list') >= 0) return { text: FIXTURES.apps, stream: 'stdout', code: 0 };
      if (dryRun) return { text: buildUninstallPreview(args), stream: 'stdout', code: 0 };
      return { text: buildUninstallRun(args), stream: 'stdout', code: 0 };
    }
    if (command === 'clean') {
      return { text: dryRun ? FIXTURES.cleanPreview : buildCleanRun(), stream: 'stdout', code: 0 };
    }
    if (command === 'optimize') {
      return { text: dryRun ? FIXTURES.optimizePreview : buildOptimizeRun(), stream: 'stdout', code: 0 };
    }
    if (command === 'purge') {
      if (dryRun) {
        var purgeText = SCENARIO === 'purge-preview' ? FIXTURES.purgePreviewArtifacts : FIXTURES.purgePreview;
        return { text: purgeText, stream: 'stdout', code: 0 };
      }
      return { text: FIXTURES.purgeRunComplete, stream: 'stdout', code: 0 };
    }
    if (command === 'installer') {
      return { text: ['Installer', '', '→ Interactive installer must run in Terminal.', 'EXIT=0'].join('\n'), stream: 'stdout', code: 0 };
    }
    return { text: buildGeneric(args), stream: 'stdout', code: 0 };
  }

  // In the "running" snapshot scenario the job must stay active so the screen
  // shows the running state and its cancel button, instead of settling.
  function holdForRunningScenario(spec, args, dryRun) {
    var command = args[0] || '';
    var holdable = command === 'clean' || command === 'optimize' || command === 'uninstall';
    if (SCENARIO === 'running' && holdable) {
      spec.holdAfterChunks = 5;
    }
    void dryRun;
    return spec;
  }

  // ----------------------------------------------------------- job running

  function chunkText(text) {
    var parts = String(text).split('\n');
    var chunks = [];
    for (var i = 0; i < parts.length; i += 8) {
      var chunk = parts.slice(i, i + 8).join('\n');
      if (i + 8 < parts.length) chunk += '\n';
      chunks.push(chunk);
    }
    return chunks;
  }

  function startJob(jobId, args, privileged, label) {
    emit({ type: 'job_started', jobId: jobId, args: args, label: label, privileged: privileged });
  }

  function finishJob(jobId, payload) {
    var job = jobs[jobId];
    if (!job) return;
    delete jobs[jobId];
    emit({
      type: 'job_exit',
      jobId: jobId,
      code: payload.code == null ? 0 : payload.code,
      cancelled: !!payload.cancelled,
      durationMs: Date.now() - job.startedAt,
      error: payload.error || ''
    });
    scheduleSettled(500);
  }

  function streamJob(jobId, spec, args) {
    var job = jobs[jobId];
    if (!job) return;
    var chunks = chunkText(spec.text || '');
    var index = 0;
    var stream = spec.stream || 'stdout';
    job.timer = window.setInterval(function () {
      if (!jobs[jobId] || jobs[jobId].cancelled) return;
      if (index < chunks.length) {
        if (chunks[index]) emit({ type: 'job_output', jobId: jobId, stream: stream, text: chunks[index] });
        index += 1;
        if (spec.holdAfterChunks && index >= spec.holdAfterChunks) {
          window.clearInterval(job.timer);
          job.timer = null;
        }
        return;
      }
      window.clearInterval(job.timer);
      if (spec.stderr) emit({ type: 'job_output', jobId: jobId, stream: 'stderr', text: spec.stderr });
      finishJob(jobId, { code: spec.forceError ? (spec.code || 1) : spec.code || 0 });
      void args;
    }, 40);
  }

  function runJob(msg) {
    var jobId = msg.jobId || 'mock-job-' + Math.random().toString(36).slice(2);
    var args = (Array.isArray(msg.args) ? msg.args : []).map(String);
    var privileged = !!msg.privileged;
    var label = msg.label || args.join(' ');
    jobs[jobId] = { jobId: jobId, args: args, privileged: privileged, startedAt: Date.now(), cancelled: false, timer: null };

    if (SCENARIO === 'cli-missing' && !cli.ok) {
      window.setTimeout(function () {
        finishJob(jobId, { code: 127, error: 'spawn_failed' });
      }, 120);
      return;
    }
    if (SCENARIO === 'auth-cancel' || SCENARIO === 'auth-failed') {
      window.setTimeout(function () {
        emit({ type: 'auth_waiting', jobId: jobId });
      }, 80);
      window.setTimeout(function () {
        finishJob(jobId, {
          code: SCENARIO === 'auth-failed' ? 99 : 130,
          cancelled: SCENARIO === 'auth-cancel',
          error: SCENARIO === 'auth-failed' ? 'auth_failed' : 'auth_cancelled'
        });
      }, 700);
      return;
    }

    var spec = holdForRunningScenario(route(args), args, args.indexOf('--dry-run') >= 0);
    if (privileged) {
      window.setTimeout(function () {
        if (!jobs[jobId]) return;
        emit({ type: 'auth_waiting', jobId: jobId });
      }, 90);
    }
    window.setTimeout(function () {
      if (!jobs[jobId]) return;
      startJob(jobId, args, privileged, label);
      if (spec.hold) return;
      streamJob(jobId, spec, args);
    }, privileged ? 320 : 60);
  }

  function cancelJob(jobId) {
    var job = jobs[jobId];
    if (!job) return;
    job.cancelled = true;
    if (job.timer) window.clearInterval(job.timer);
    finishJob(jobId, { code: 130, cancelled: true });
  }

  // -------------------------------------------------------------- actions

  function handleAction(message) {
    if (!message || !message.action) return;
    switch (message.action) {
      case 'init':
        window.setTimeout(function () {
          emit({ type: 'ready', app: APP, cli: cli, config: config, home: HOME, paths: PATHS });
          scheduleSettled(350);
          scheduleForcedSettle();
        }, 40);
        break;
      case 'run':
        runJob(message);
        break;
      case 'cancel':
        cancelJob(message.jobId);
        break;
      case 'getConfig':
        window.setTimeout(function () {
          emit({ type: 'config_changed', config: config });
        }, 20);
        break;
      case 'setConfig':
        if (message.patch && typeof message.patch === 'object') {
          Object.keys(message.patch).forEach(function (key) {
            config[key] = message.patch[key];
          });
          saveConfig();
          window.setTimeout(function () {
            emit({ type: 'config_changed', config: config });
          }, 20);
        }
        break;
      case 'chooseCLI':
        window.setTimeout(function () {
          cli = { path: '/usr/local/bin/mo', version: appVersion, source: 'manual', ok: true, error: '' };
          config.cliPath = cli.path;
          saveConfig();
          emit({ type: 'cli_changed', cli: cli });
        }, 320);
        break;
      case 'reveal':
        toast('已在访达中显示：' + (message.path || ''), 'success');
        break;
      case 'openExternal':
        toast('模拟模式：不会打开外部链接', 'info');
        break;
      case 'openTerminal':
        toast('已在终端中打开 Mole CLI', 'success');
        break;
      case 'clipboard':
        toast('已复制到剪贴板', 'success');
        break;
      case 'exportJSON':
        toast('已导出 ' + (message.suggestedName || 'mole-export.json'), 'success');
        break;
      case 'uninstallSelf':
        toast('模拟模式：不会卸载应用', 'warning');
        break;
      case 'quit':
        toast('模拟模式：不会退出应用', 'info');
        break;
      default:
        break;
    }
  }

  window.webkit = window.webkit || {};
  window.webkit.messageHandlers = window.webkit.messageHandlers || {};
  window.webkit.messageHandlers.mole = {
    postMessage: function (message) {
      window.setTimeout(function () {
        try {
          handleAction(message);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[MoleMock] action failed', message && message.action, error);
        }
      }, 0);
    }
  };

  if (window.MoleBridge) {
    window.MoleBridge.isMock = true;
    window.MoleBridge.state.mock = true;
  }

  window.MoleMock = {
    active: true,
    screen: SCREEN,
    scenario: SCENARIO,
    fixtures: FIXTURES,
    config: config,
    cli: cli,
    home: HOME,
    paths: PATHS,
    version: appVersion
  };
  window.__moleMockFixtures = FIXTURES;

  scheduleSettled(500);
  scheduleForcedSettle();
})();
