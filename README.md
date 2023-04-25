# telegram-bot-on-cloudfare
A Serverless  telegram bot use cloudfare worker
Use openai for chat.
Use azure tts for speech to text and text to speech

# Set up 
Add five Variables In the worker setting

- BOT_SECRET
  An random string ,for telegram webhook resister and request verify
- BOT_TOKEN
  A token from telegram 
- OPENAI_KEY
  Open ai api key
- SPEECH_KEY
  azure speech key
- SPEECH_REGION
  azure speech region
  
# Run In Local

```
npx  wrangler dev 
```

# Deploy
```
npx  wrangler publish
```


