from flask import Flask, request, jsonify
import faiss
import numpy as np
import os
from dotenv import load_dotenv
from openai import OpenAI
import json
import tiktoken

# Load environment variables
load_dotenv()

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = Flask(__name__)

# Persistent directory for FAISS database
persist_directory = "db"
documents_directory = "documents"

# Create directories if they don't exist
if not os.path.exists(persist_directory):
    os.makedirs(persist_directory)
if not os.path.exists(documents_directory):
    os.makedirs(documents_directory)

# Initialize FAISS index
EMBEDDING_DIM = 1536  # Dimension for text-embedding-ada-002
index = faiss.IndexFlatL2(EMBEDDING_DIM)
documents = []


def get_embedding(text):
    """Get embedding for a text using OpenAI's API"""
    response = client.embeddings.create(
        model="text-embedding-ada-002",
        input=text
    )
    return response.data[0].embedding


def chunk_text(text, chunk_size=1000, overlap=200):
    """Split text into chunks with overlap"""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = ' '.join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks


def initialize_documents():
    """Initialize and ingest documents"""
    global index, documents

    try:
        # Try to load existing index
        if os.path.exists(os.path.join(persist_directory, "faiss.index")):
            index = faiss.read_index(os.path.join(
                persist_directory, "faiss.index"))
            with open(os.path.join(persist_directory, "documents.json"), 'r') as f:
                documents = json.load(f)
            print("Loaded existing FAISS index and documents.")
            return
    except Exception as e:
        print("Could not load existing index:", e)

    try:
        # Load and process documents
        for filename in os.listdir(documents_directory):
            if filename.endswith(".txt"):
                with open(os.path.join(documents_directory, filename), 'r') as f:
                    text = f.read()

                # Split text into chunks
                chunks = chunk_text(text)

                # Get embeddings and add to FAISS index
                for chunk in chunks:
                    embedding = get_embedding(chunk)
                    index.add(np.array([embedding], dtype=np.float32))
                    documents.append(chunk)

        # Save index and documents
        faiss.write_index(index, os.path.join(
            persist_directory, "faiss.index"))
        with open(os.path.join(persist_directory, "documents.json"), 'w') as f:
            json.dump(documents, f)

        print("Successfully ingested files.")
    except Exception as e:
        print(f"Error during document initialization: {e}")
        raise


# Custom prompt template with emphasis on brevity
CUSTOM_PROMPT = """You are Shaw, the founder of Eliza and ai16z. Use the following pieces of context and style guide to answer the question in a way that matches Shaw's communication style.

Context from documents: {context}

Style Guide:
- Be direct and enthusiastic
- Use casual, tech-savvy language
- Often reference open source, AI agents, and community
- Include relevant links when appropriate (eliza.systems, discord.gg/ai16z)
- Occasionally use emojis like 🌙 and expressions like "based" or "bullish"
- Balance technical depth with accessibility
- Show excitement about community contributions
- Emphasize open source and decentralization
- Reference real use cases and implementations
- Keep responses concise but informative
- Limit responses to a few sentences suitable for chat or DMs

Question: {question}

Remember to maintain Shaw's authentic voice while providing accurate information based on the context. The response should feel like it's coming from a founder who is passionate about open source AI and community building.

Response:"""


@app.route("/query", methods=["POST"])
def query_documents():
    print("Query received")
    query = request.json.get("query")

    if not query:
        return jsonify({"error": "Query is required"}), 400

    try:
        # Get query embedding
        query_embedding = get_embedding(query)

        # Search similar documents
        k = 3  # Number of similar documents to retrieve
        D, I = index.search(np.array([query_embedding], dtype=np.float32), k)

        # Get relevant context
        context = "\n".join([documents[i] for i in I[0]])

        # Create completion with context
        messages = [
            {"role": "system", "content": CUSTOM_PROMPT.format(
                context=context, question=query)},
            {"role": "user", "content": query}
        ]

        response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=messages,
            temperature=0.5,  # Lower temperature for more focused responses
            max_tokens=150,  # Limit the response length
            top_p=0.9  # Use nucleus sampling
        )

        return jsonify({
            "answer": response.choices[0].message.content,
            # "sources": [documents[i] for i in I[0]]
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Initialize documents when starting the server
initialize_documents()

if __name__ == "__main__":
    app.run(port=5000)
