import * as builder from 'xmlbuilder';
import set = Reflect.set;

const API_WEBHOOK = '/bot'
const API_REGISTER = '/registerWebhook'
const API_UNREGISTER = '/unRegisterWebhook'
const SPEECH_OUTPUT_FORMAT = "audio-16khz-128kbitrate-mono-mp3"
const SPEECH_AGENT = "bot"
const SPEECH_TO_TEXT = "speechToText"
const TEXT_TO_SPEECH = "textToSpeech"
const OPEN_AI_API_CHAT = "chat/completions"
const BOT_SEND_VOICE = "sendVoice"
const BOT_SEND_MESSAGE = "sendMessage"
const BOT_SEB_WEBHOOK = 'setWebhook'
const BOT_DOWNLOAD_FILE = 'file'
const BOT_GET_FILE = 'getFile'
const BOT_SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token'

const MESSAGE_COMMAND = "command"
const MESSAGE_TEXT = "text"
const MESSAGE_VOICE = "voice"
const MESSAGE_UNKNOWN = "unknown"
const MESSAGE_REPLAY = "replay"
const BUTTON_MESSAGE = "请选择:"
const BUTTON_TOP = [
    [
        {
            text: '上下文消息个数',
            callback_data: 'context'
        },
        {
            text: '工坊',
            callback_data: 'tools'
        }
    ]
]
const BUTTON_CONTEXT = [
    [
        {
            text: '0',
            callback_data: 'ct_0'
        },
        {
            text: '4',
            callback_data: 'ct_4'
        },
        {
            text: '10',
            callback_data: 'ct_10'
        },
        {
            text: '30',
            callback_data: 'ct_30'
        },
        {
            text: '50',
            callback_data: 'ct_50'
        }
    ],
    [
        {
            text: '清除历史记录',
            callback_data: 'ct_-1'
        }
    ],
    [
        {
            text: '返回上一级',
            callback_data: 'back_top'
        }
    ]

]

const CHAT_MAX_NUM = 100
const CHAT_CONTEXT_NUMBER = new Map<string, number>();
const CHAT_HISTORY = new Map<String, String>()


export default {
    async fetch(request, env) {
        return handleRequest(request, env)
    }
};

async function handleRequest(request, env) {
    const url = new URL(request.url)
    if (url.pathname === API_WEBHOOK) {
        return await handlerBotRequest(request, env)
    } else if (url.pathname === API_REGISTER) {
        return await registerWebhook(url, API_WEBHOOK, env)
    } else if (url.pathname === API_UNREGISTER) {
        return await unRegisterWebhook(env)
    }
}


/**
 * Remove webhook
 * https://core.telegram.org/bots/api#setwebhook
 */
async function unRegisterWebhook(env) {
    const token = env.BOT_TOKEN
    const unRegisterData = {
        url: ''
    }
    const url = buildTelegramUrl(BOT_SEB_WEBHOOK, token, unRegisterData)
    const unRegisterResponse = await fetch(url);
    return unRegisterResponse
}

/**
 * Set webhook to this worker's url
 * https://core.telegram.org/bots/api#setwebhook
 */
async function registerWebhook(requestUrl, suffix, env) {
    const secret = env.BOT_SECRET
    const token = env.BOT_TOKEN
    const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`
    const registerData = {
        url: webhookUrl, secret_token: secret
    }
    const url = buildTelegramUrl(BOT_SEB_WEBHOOK, token, registerData)
    const registerResponse = await fetch(url);
    return registerResponse
}


async function handlerBotRequest(request, env) {
    // Check secret
    const botKey = env.BOT_SECRET
    if (request.headers.get(BOT_SECRET_HEADER) !== botKey) {
        return new Response('Unauthorized', {status: 403})
    }
    console.log(" process request ")
    const update = await request.json();
    const botToken = env.BOT_TOKEN
    console.log("update info " + JSON.stringify(update))
    const message = checkMessageType(update)
    const messageType = message.command
    const messageData = message.data
    const chatId = getChatId(messageData)
    switch (messageType) {
        case "replay":
            return await replayCommand(chatId, messageData.data, botToken, env)
        case "command":
            return await processCommand(chatId, messageData, botToken, env)
        case "text":
        case "voice":
            return await processChat(chatId, messageData, botToken, env)
        case "unknown":
            return await sendTextMessage(chatId, "", "すみません", botToken)
    }

}

function getChatId(message) {
    let chatMessage = message
    if ("message" in message) {
        chatMessage = message.message
    }
    return chatMessage.chat.id
}

async function replayCommand(chatId, command, botToken, env) {
    console.log("command type is " + command)
    switch (command) {
        case "context":
            let contextNumber = await getContextNum(chatId)
            const message = "当前上下文数量" + contextNumber
            const result = await sendInlineButtons(chatId, botToken, message, BUTTON_CONTEXT)
            return new Response("ok")
        case "tools":
            return await sendTextMessage(chatId, "", "工具正在开发中", botToken)
        default :
            return await replaySecondMand(chatId, command, botToken, env)
    }
}

async function replaySecondMand(chatId, command, botToken, env) {
    if (command.startsWith("ct_")) {
        return await setContext(chatId, command, botToken, env)
    } else {
        return new Response("ok")
    }
}

async function setContext(chatId, command, botToken, env) {
    const contextNum = command.replace("ct_", "")
    if (contextNum == "-1") {
        return await clearHistory(chatId, botToken)
    } else {
        CHAT_CONTEXT_NUMBER.set(chatId, contextNum)
        return await sendTextMessage(chatId, "", "上下文数量已经设置成" + contextNum, botToken)
    }
}

async function clearHistory(chatId, botToken) {
    const history = await getHistory(chatId)
    const allHistory = history.flat().join("\n")
    CHAT_HISTORY.set(chatId, null)
    return sendTextMessage(chatId, "聊天记录", allHistory, botToken)
}

async function getContextMessage(chatId) {
    const history = await getHistory(chatId)
    const contextNum = await getContextNum(chatId)
    if (contextNum == 0) {
        return []
    }
    const contextHistory = history.splice(-contextNum)
    const contextMessage = []
    contextHistory.forEach(function (element) {
        const userChat = {
            "role": "user",
            "content": element[0]
        }
        const aiChat = {
            "role": "assistant",
            "content": element[1]
        }
        contextMessage.push(userChat)
        contextMessage.push(aiChat)
    });
    return contextMessage

}

async function getContextNum(chatId) {
    let contextNumber = CHAT_CONTEXT_NUMBER.get(chatId)
    contextNumber = contextNumber == undefined ? 0 : contextNumber
    return contextNumber
}

async function getHistory(chatId) {
    const history = CHAT_HISTORY.get(chatId)
    if (history != undefined && history != null) {
        const message = JSON.parse(history)
        return message
    } else {
        return []
    }
}

async function saveHistory(chatId, user: string, ai: string) {
    let history: Array<Array<string>> = await getHistory(chatId)
    const newChat: Array<string> = [user, ai]
    if (history.length > CHAT_CONTEXT_NUMBER) {
        console.log("history max to 100, remove the first one")
        history.shift()
    }
    history.push(newChat)
    CHAT_HISTORY.set(chatId, JSON.stringify(history))
    return history
}

async function processChat(chatId, message, botToken, env) {
    //todo save history message
    const userMessage = await extractTelegramMessage(message, botToken, env)
    const chatContext = await getContextMessage(chatId)
    const aiMessage = await chatWithAI(userMessage, env, chatContext);
    const audioData = await textToSpeech(aiMessage, env)
    const textMessage = await sendTextMessage(chatId, userMessage, aiMessage, botToken)
    const voiceMessage = await sendVoiceMessage(chatId, audioData, botToken)
    const history = await saveHistory(chatId, userMessage, aiMessage)
    return Response.json(history)
}

async function processCommand(chatId, message, botToken, env) {
    const command = message.text
    switch (command) {
        case "/menu":
            return await sendInlineButtons(chatId, botToken, BUTTON_MESSAGE, BUTTON_TOP)
        default:
            return sendTextMessage(chatId, "", "无效操作", botToken)
    }
}

/**
 * Send a message with buttons, `buttons` must be an array of arrays of button objects
 * https://core.telegram.org/bots/api#sendmessage
 */
async function sendInlineButtons(chatId, token, text, buttons) {
    const parameters = {
        chat_id: chatId,
        reply_markup: JSON.stringify({
            inline_keyboard: buttons
        }),
        text: text
    }
    const url = buildTelegramUrl(BOT_SEND_MESSAGE, token, parameters)
    const buttonResponse = await fetch(url);
    return buttonResponse

}

async function extractTelegramMessage(message, secret: string, env) {
    if ('text' in message) {
        return message.text
    } else if ('voice' in message) {
        return await processVoiceMessage(message, secret, env)
    } else {
        return "こにちは"
    }
}


async function processVoiceMessage(message, secret: string, env) {
    const fileId = message.voice.file_id
    const fileData = await downloadTelegramFile(fileId, secret)
    const messageText = await speechToText(fileData, env)
    return messageText
}


/**
 * download file from telegram
 * https://api.telegram.org/file/bot<token>/<file_path>
 * @param fileId
 */
async function downloadTelegramFile(fileId: string, secret: string) {
    const filePath = await getTelegramFilePath(fileId, secret)
    const url = `https://api.telegram.org/${BOT_DOWNLOAD_FILE}/bot${secret}/${filePath}`
    const fileResponse = await fetch(url)
    const fileData = await fileResponse.arrayBuffer();
    return fileData
}

/**
 * get file from telegram
 * https://api.telegram.org/bot{token}/getFile
 * @param fileId
 */
async function getTelegramFilePath(fileId: String, secret: string) {
    const url = buildTelegramUrl(BOT_GET_FILE, secret)
    const getFileData = {
        "file_id": fileId
    }
    const headers = new Headers();
    headers.set('Content-Type', "application/json")
    const fileResponse = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(getFileData),
    })
    const fileInfo = await fileResponse.json()
    return fileInfo.result.file_path
}

async function chatWithAI(update_message: string, env, history = null) {
    const openAiKey = env.OPENAI_KEY
    const headers = buildOpenAiHeader(openAiKey)
    const openAiUrl = buildOpenAiUrl(OPEN_AI_API_CHAT)
    const chatRequest = buildChatRequest(update_message, history)
    const aiResponse = await fetch(openAiUrl, {
        method: "post",
        headers: headers,
        body: chatRequest
    });
    const aiData = await aiResponse.json();
    if ('choices' in aiData) {
        const aiChoices = aiData.choices[0].message.content;
        return aiChoices
    } else {
        return "すみません"
    }

}

async function textToSpeech(text: string, env) {
    const speechKey = env.SPEECH_KEY
    const speechRegion = env.SPEECH_REGION
    const headers = buildTextToSpeechHeader(speechKey, SPEECH_OUTPUT_FORMAT, SPEECH_AGENT)
    const url = buildSpeechUrl(speechRegion, TEXT_TO_SPEECH)
    const voiceRequest = buildSpeechRequestBody(text)
    const voiceResponse = await fetch(url, {
        method: "POST",
        headers: headers,
        body: voiceRequest,
    })
    const audioData = await voiceResponse.arrayBuffer();
    return audioData
}


async function speechToText(fileData: ArrayBuffer, env) {
    const speechKey = env.SPEECH_KEY
    const speechRegion = env.SPEECH_REGION
    const headers = buildSpeechToTextHeader(speechKey)
    const language = {
        "language": "ja-JP"
    }
    const url = buildSpeechUrl(speechRegion, SPEECH_TO_TEXT, language)
    const recognizeResponse = await fetch(url, {
        method: "POST",
        headers: headers,
        body: fileData,
    })
    const recognizeResult = await recognizeResponse.json()
    return recognizeResult.DisplayText
}

async function sendVoiceMessage(chatId, audioData: ArrayBuffer, secret: string) {
    const url = buildTelegramUrl(BOT_SEND_VOICE, secret)
    const voiceData = buildVoiceFormData(chatId, audioData)
    const chatVoiceResponse = await fetch(url, {
        method: 'POST',
        body: voiceData,
    });
    return chatVoiceResponse
}

async function sendTextMessage(chatId, input: string, response: string, secret: string) {
    const url = buildTelegramUrl(BOT_SEND_MESSAGE, secret)
    const messageData = buildMessageData(chatId, input, response)
    const headers = new Headers()
    headers.append("Content-Type", "application/json")
    const messageResponse = await fetch(url, {
        method: "POST",
        headers: headers,
        body: messageData
    });
    return messageResponse
}


function buildSpeechRequestBody(text: string) {
    const root = builder.create('speak', {headless: true});
    root.att('version', '1.0');
    root.att('xml:lang', 'ja-JP');
    // 子要素を追加
    const markDownStartIndex = text.indexOf("```")
    const markDownEndIndex = text.lastIndexOf("```")
    let formatText = text
    if (markDownStartIndex != -1 && markDownEndIndex != -1) {
        formatText = text.substring(0, markDownStartIndex) + text.substring(markDownEndIndex + 3, text.length)
    }
    formatText = formatText.replace("\n", "")
    const voiceAttribute = {
        'xml:lang': 'ja-JP',
        'xml:gender': 'Female',
        'name': 'ja-JP-MayuNeural'
    }
    root.ele('voice', voiceAttribute).txt(formatText);
    // XMLを文字列として出力
    const voiceRequestBody = root.end({pretty: true})
    return voiceRequestBody
}

function buildTextToSpeechHeader(speechKey: string, outputFormat: string, agent: string) {
    const headers = new Headers();
    headers.set('Ocp-Apim-Subscription-Key', speechKey);
    headers.set('Content-Type', "application/ssml+xml")
    headers.set('X-Microsoft-OutputFormat', outputFormat)
    headers.set('User-Agent', agent)
    return headers

}

function buildSpeechUrl(region: string, methodName: string, params = null) {
    let query = ''
    if (params) {
        query = '?' + new URLSearchParams(params).toString()
    }
    if (methodName == TEXT_TO_SPEECH) {
        return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1${query}`
    } else if (methodName == SPEECH_TO_TEXT) {
        return `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1${query}`
    }
}

function buildTelegramUrl(methodName: string, token: string, params = null) {
    let query = ''
    if (params) {
        query = '?' + new URLSearchParams(params).toString()
    }
    return `https://api.telegram.org/bot${token}/${methodName}${query}`
}

function buildOpenAiUrl(methodName: string) {
    const openAiUrl = `https://api.openai.com/v1/${methodName}`
    return openAiUrl
}

function buildOpenAiHeader(token: string) {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json")
    return headers
}

function buildChatRequest(chat: string, history = null) {
    const systemRoleMessage = {
        "role": "system",
        "content": "The following is a conversation with an AI assistant. The AI assistant response with Japanese."
    }
    const newRoleMessage = {
        "role": "user",
        "content": chat
    }
    let messages = [systemRoleMessage]
    if (null != history || undefined != history) {
        messages = messages.concat(history)
    }
    messages = messages.concat([newRoleMessage])
    const chatRequest = {
        "model": "gpt-3.5-turbo",
        "messages": messages
    }
    return JSON.stringify(chatRequest)

}

function buildVoiceFormData(chatId: string, audioData: ArrayBuffer) {
    const voiceFormData = new FormData();
    voiceFormData.append("chat_id", chatId)
    voiceFormData.append('voice', new Blob([audioData], {type: 'audio/ogg'}));
    return voiceFormData
}

function buildMessageData(chatId, input: string, response: string) {
    const message = input + "\n" + response
    const messageData = {
        "chat_id": chatId,
        "text": message
    }
    return JSON.stringify(messageData)
}

function buildSpeechToTextHeader(speechKey: string) {
    const headers = new Headers();
    headers.set('Ocp-Apim-Subscription-Key', speechKey);
    headers.set('Content-Type', "audio/wav")
    headers.set('Accept', "application/json")
    return headers

}

function checkMessageType(update) {
    let message = null
    let command = MESSAGE_UNKNOWN
    if ('message' in update) {
        message = update.message
        if ('entities' in message) {
            command = MESSAGE_COMMAND
        } else if ('text' in message) {
            command = MESSAGE_TEXT
        } else if ('voice' in message) {
            command = MESSAGE_VOICE
        }
    } else if ('callback_query' in update) {
        message = update.callback_query
        command = MESSAGE_REPLAY
    }

    return {
        "command": command,
        "data": message
    }
}


