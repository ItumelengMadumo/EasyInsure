import psycopg2

# Connect to PostgreSQL
conn = psycopg2.connect(
    dbname="Insurance_llm",
    user="postgres",  # Change if using another username
    password="admin",  # Replace with your actual password
    host="localhost",
    port="5433"
)

# Create cursor
cursor = conn.cursor()

# Query to list all tables
cursor.execute("""
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
""")

tables = cursor.fetchall()

print("📌 Tables in Database:")
for table in tables:
    print(table[0])

# Close connection
cursor.close()
conn.close()
