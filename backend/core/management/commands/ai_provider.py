"""Create, list and switch AI provider configs from the command line.

    python manage.py ai_provider list
    python manage.py ai_provider set agentrouter-opus \
        --base-url https://agentrouter.org/v1 \
        --model claude-opus-4-8 \
        --api-key sk-... \
        --activate
    python manage.py ai_provider use agentrouter-opus
    python manage.py ai_provider test

``set`` is an upsert, so re-running it with a new --model edits the config in
place instead of erroring on the unique name.
"""

from django.core.management.base import BaseCommand, CommandError

from core.models import AIProviderConfig


class Command(BaseCommand):
    help = "Manage the switchable AI provider configs."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="subcommand", required=True)

        sub.add_parser("list", help="Show every config, marking the active one.")

        p_set = sub.add_parser("set", help="Create or update a config.")
        p_set.add_argument("name")
        p_set.add_argument("--base-url", dest="base_url")
        p_set.add_argument("--model")
        p_set.add_argument("--api-key", dest="api_key")
        p_set.add_argument(
            "--activate",
            action="store_true",
            help="Switch to this config once saved.",
        )

        p_use = sub.add_parser("use", help="Switch to an existing config.")
        p_use.add_argument("name")

        sub.add_parser("test", help="Make a real 1-token call with the active config.")

    def handle(self, *args, **options):
        return getattr(self, f"_handle_{options['subcommand']}")(options)

    def _handle_list(self, options):
        configs = AIProviderConfig.objects.all()
        if not configs:
            self.stdout.write(
                "No configs yet. The AI layer is falling back to EMERGENT_LLM_KEY / "
                "OPENAI_BASE_URL / OPENAI_MODEL."
            )
            return
        for c in configs:
            marker = "*" if c.is_active else " "
            self.stdout.write(
                f"{marker} {c.name:<24} {c.model:<28} {c.base_url}  key={c.masked_api_key or '(env)'}"
            )

    def _handle_set(self, options):
        name = options["name"]
        config = AIProviderConfig.objects.filter(name=name).first()

        if config is None:
            missing = [
                flag
                for flag, key in (("--base-url", "base_url"), ("--model", "model"))
                if not options.get(key)
            ]
            if missing:
                raise CommandError(
                    f"{name!r} does not exist yet, so {' and '.join(missing)} are required."
                )
            config = AIProviderConfig(name=name)

        for key in ("base_url", "model", "api_key"):
            if options.get(key) is not None:
                setattr(config, key, options[key])

        config.save()
        self.stdout.write(self.style.SUCCESS(f"Saved {config.name} → {config.model}"))

        # An otherwise-unused config would be a silent no-op, so activate the
        # very first one automatically.
        if options["activate"] or not AIProviderConfig.objects.filter(is_active=True).exists():
            config.activate()
            self.stdout.write(self.style.SUCCESS(f"Active config is now {config.name}"))

    def _handle_use(self, options):
        config = AIProviderConfig.objects.filter(name=options["name"]).first()
        if config is None:
            available = ", ".join(AIProviderConfig.objects.values_list("name", flat=True)) or "none"
            raise CommandError(f"No config named {options['name']!r}. Available: {available}")
        config.activate()
        self.stdout.write(self.style.SUCCESS(f"Active config is now {config.name} ({config.model})"))

    def _handle_test(self, options):
        from asgiref.sync import async_to_sync
        from services.ai_service import ai_service

        result = async_to_sync(ai_service.check_connection)()
        style = self.style.SUCCESS if result["ok"] else self.style.ERROR
        self.stdout.write(style(f"{result['provider']} / {result['model']} → {result['detail']}"))
