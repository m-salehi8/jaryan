from core.models import User, Department, Workflow, Task
from core.mongo import get_db
from asgiref.sync import sync_to_async

def model_to_dict(instance):
    if not instance:
        return None
    from django.forms.models import model_to_dict as django_model_to_dict
    d = django_model_to_dict(instance)
    d['id'] = instance.id
    # Some special handling for related fields or JSON fields if needed
    if isinstance(instance, Workflow):
        d['nodes'] = instance.nodes
        d['edges'] = instance.edges
    return d

class DjangoCollection:
    def __init__(self, model):
        self.model = model

    async def find_one(self, query, projection=None):
        # Convert mongo query to django kwargs
        kwargs = {}
        for k, v in query.items():
            if k == '_id': continue
            kwargs[k] = v
        try:
            # We use sync_to_async because aget might have issues with some relationships
            instance = await self.model.objects.filter(**kwargs).afirst()
            return model_to_dict(instance)
        except Exception as e:
            print("find_one error:", e)
            return None

    def find(self, query):
        class Cursor:
            def __init__(self, model, query):
                self.model = model
                kwargs = {}
                for k, v in query.items():
                    if k == '_id': continue
                    if isinstance(v, dict) and "$in" in v:
                        kwargs[f"{k}__in"] = v["$in"]
                    elif isinstance(v, dict) and "$lt" in v:
                        kwargs[f"{k}__lt"] = v["$lt"]
                    elif isinstance(v, dict) and "$ne" in v:
                        # Exclude logic
                        pass
                    else:
                        kwargs[k] = v
                self.kwargs = kwargs
                self.query = query

            async def to_list(self, length):
                # A quick hack for the specific queries engine.py does
                kwargs = self.kwargs
                exclude = {}
                for k, v in self.query.items():
                    if isinstance(v, dict) and "$ne" in v:
                        exclude[k] = v["$ne"]
                
                @sync_to_async
                def _get():
                    qs = self.model.objects.filter(**kwargs)
                    if exclude:
                        qs = qs.exclude(**exclude)
                    return [model_to_dict(i) for i in qs[:length]]
                return await _get()
        return Cursor(self.model, query)

    async def update_one(self, query, update):
        kwargs = {}
        for k, v in query.items():
            if k == '_id': continue
            kwargs[k] = v
        
        set_data = update.get("$set", {})
        @sync_to_async
        def _update():
            qs = self.model.objects.filter(**kwargs)
            qs.update(**set_data)
        await _update()

    async def insert_many(self, docs):
        @sync_to_async
        def _insert():
            instances = []
            for doc in docs:
                kwargs = {k: v for k, v in doc.items() if k != '_id'}
                instances.append(self.model(**kwargs))
            self.model.objects.bulk_create(instances)
        await _insert()

class EngineDBWrapper:
    @property
    def users(self):
        return DjangoCollection(User)
        
    @property
    def departments(self):
        return DjangoCollection(Department)
        
    @property
    def workflows(self):
        return DjangoCollection(Workflow)
        
    @property
    def tasks(self):
        return DjangoCollection(Task)
        
    @property
    def processes(self):
        return get_db().processes
        
    @property
    def process_instances(self):
        return get_db().process_instances
        
    @property
    def activity_logs(self):
        return get_db().activity_logs
        
    @property
    def activities(self):
        return get_db().activities

db_wrapper = EngineDBWrapper()
