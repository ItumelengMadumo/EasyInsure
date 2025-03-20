import psycopg2

# Establish connection to the database
conn = psycopg2.connect(
    dbname="llm_analysis_db",
    user="postgres",  # Or your username
    password="10664",
    host="localhost",
    port="5433"
)

# Create a cursor object to interact with the database
cursor = conn.cursor()

# Example of inserting LLM analysis data
input_text = "This is a sample text to analyze."
analysis_result = "Positive sentiment detected."

cursor.execute(
    "INSERT INTO analysis (input_text, analysis_result) VALUES (%s, %s)",
    (input_text, analysis_result)
)

# Commit the changes
conn.commit()

# Close the connection
cursor.close()
conn.close()
