import asyncio
from croniter import croniter
from datetime import datetime, timezone

def test():
    expr = "* * * * *"
    now = datetime.now(timezone.utc)
    print("Match:", croniter.match(expr, now))

test()
