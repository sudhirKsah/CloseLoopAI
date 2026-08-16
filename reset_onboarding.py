import redis
r = redis.Redis(host='localhost', port=6380, decode_responses=True)
graph = 'org_c854007bd36645d9859ad24fa15fc5d5'

# Delete ALL nodes and edges — complete clean slate
q = "MATCH (n) DETACH DELETE n"
result = r.execute_command('GRAPH.QUERY', graph, q)
print('Deleted all nodes:', result)

# Verify it's empty
q2 = "MATCH (n) RETURN count(n)"
result2 = r.execute_command('GRAPH.QUERY', graph, q2)
print('Node count after wipe:', result2)

print('Done — completely clean slate')
