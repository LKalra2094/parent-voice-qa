#!/bin/bash
# Records from your mic, sends to the API, plays the answer back

echo "🎤 Recording in 1 second... Speak your question then press Ctrl+C to stop."
sleep 1

# Record from mic (press Ctrl+C when done)
rec /tmp/my_question.wav silence 1 0.1 1% 1 2.0 5% 2>/dev/null || \
  sox -d /tmp/my_question.wav silence 1 0.1 1% 1 2.0 5% 2>/dev/null

echo ""
echo "📤 Sending to API..."

# Send to backend
curl -s -X POST https://parent-voice-qa.vercel.app/api/ask \
  -F "audio=@/tmp/my_question.wav" \
  -o /tmp/answer.mp3 \
  -D /tmp/answer_headers.txt

echo "📝 You said: $(grep -i 'x-transcribed-text' /tmp/answer_headers.txt | sed 's/.*: //' | python3 -c "import sys,urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))")"
echo "💬 Answer: $(grep -i 'x-answer-text' /tmp/answer_headers.txt | sed 's/.*: //' | python3 -c "import sys,urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))")"
echo ""
echo "🔊 Playing answer..."
afplay /tmp/answer.mp3
