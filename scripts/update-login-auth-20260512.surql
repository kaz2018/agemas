USE NAMESPACE agemas;
USE DATABASE main;

-- Run this query first and resolve any rows with count > 1 before applying the unique index.
SELECT last_name, first_name, count() AS count
FROM user
GROUP BY last_name, first_name
ORDER BY count DESC;

DEFINE INDEX OVERWRITE user_id_unique ON user FIELDS user_id UNIQUE;
DEFINE INDEX OVERWRITE user_full_name_unique ON user FIELDS last_name, first_name UNIQUE;

DEFINE ACCESS OVERWRITE user ON DATABASE TYPE RECORD
  SIGNIN (
    SELECT * FROM user
    WHERE last_name = $last_name
      AND first_name = $first_name
      AND crypto::argon2::compare(password, $password)
  )
  DURATION FOR TOKEN 15m FOR SESSION 1d;
