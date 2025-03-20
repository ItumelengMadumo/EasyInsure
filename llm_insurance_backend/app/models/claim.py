import psycopg2
from datetime import datetime

# Connect to the database
conn = psycopg2.connect(
    dbname="Insurance_llm",
    user="postgres",
    password="10664",
    host="localhost",
    port="5433"
) 

cursor = conn.cursor()

# Insert test data into the 'claims' table
try:
    cursor.execute("""
                   SELECT CLAIMS FROM information_schema.tables
        INSERT INTO claims (id, user_id, policy_id, claim_type, description, amount_requested, status, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
    """, (
        1,  # id
        1,  # user_id
        '00001',  # policy_id
        'full claim',  # claim_type
        'client passed away',  # description
        5000.00,  # amount_requested
        'accepted',  # status
        datetime(2025, 3, 20, 14, 32, 10, 123456),  # created_at
        datetime(2025, 3, 20, 14, 32, 10, 123456)   # updated_at
    ))

    conn.commit()  # Save the changes
    print("✅ Data inserted successfully!")

except Exception as e:
    conn.rollback()  # Rollback in case of error
    print("❌ Error inserting data:", e)

# Close connection
cursor.close()
conn.close() 
