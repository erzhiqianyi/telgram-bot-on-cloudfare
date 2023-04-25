import * as builder from 'xmlbuilder';

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
    console.log(url)
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
    console.log('webhook url ' + webhookUrl)
    console.log('url is ' + url)
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
    console.log("update info " + JSON.stringify(update))
    const chatId = update.message.chat.id
    const botToken = env.BOT_TOKEN
    const messageType = checkMessageType(update.message)
    switch (messageType) {
        case "command":
            return await processCommand(chatId,update.message, botToken, env)
        case "text":
        case "voice":
            return await processChat(chatId, update.message, botToken, env)
        case "unknown":
            return await sendTextMessage(chatId, "", "すみません", botToken)
    }

}

async function processChat(chatId, message, botToken, env) {
    const update_message = await extractTelegramMessage(message, botToken, env)
    const aiResponse = await chatWithAI(update_message, env);
    const audioData = await textToSpeech(aiResponse, env)
    const textMessage = await sendTextMessage(chatId, update_message, aiResponse, botToken)
    const voiceMessage = await sendVoiceMessage(chatId, audioData, botToken)
    return textMessage
}

async function processCommand(chatId,message, botToken, env) {
    const command = message.text
    let response = "success"
    switch (command) {
        case "/enable":
            response = "enable context success"
            break
        case "/disable":
            response = "disable context success"
            break
        case "/customize":
            response = "please set your prompt"
            break
    }
    const textMessage = await sendTextMessage(chatId, "", response, botToken)
    return textMessage
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
    console.log("file is is" + fileId)
    const fileData = await downloadTelegramFile(fileId, secret)
    console.log(" download file data")
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

async function chatWithAI(update_message: string, env) {
    const openAiKey = env.OPENAI_KEY
    const headers = buildOpenAiHeader(openAiKey)
    const openAiUrl = buildOpenAiUrl(OPEN_AI_API_CHAT)
    const chatRequest = buildChatRequest(update_message)
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
    const voiceAttribute = {
        'xml:lang': 'ja-JP',
        'xml:gender': 'Female',
        'name': 'ja-JP-MayuNeural'
    }
    root.ele('voice', voiceAttribute).txt(text);
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

function buildChatRequest(chat: string) {
    const chatRequest = {
        "model": "gpt-3.5-turbo",
        "messages": [
            {
                "role": "system",
                "content": "The following is a conversation with an AI assistant. The AI assistant response with Japanese."
            },
            {
                "role": "user",
                "content": chat
            }
        ]
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

function checkMessageType(message) {
    if ('entities' in message) {
        return MESSAGE_COMMAND
    } else if ('text' in message) {
        return MESSAGE_TEXT
    } else if ('voice' in message) {
        return MESSAGE_VOICE
    } else {
        return MESSAGE_UNKNOWN
    }
}
