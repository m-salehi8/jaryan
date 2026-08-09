import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Add imports if needed
    imports_to_add = []
    if '<button' in content and 'Button' not in content[:500]:
        imports_to_add.append('import { Button } from "@/components/ui/button";')
    if '<input' in content and 'Input' not in content[:500]:
        imports_to_add.append('import { Input } from "@/components/ui/input";')

    if imports_to_add:
        # Find first non-import line or just put at top
        lines = content.split('\n')
        last_import = 0
        for i, line in enumerate(lines):
            if line.startswith('import '):
                last_import = i
        
        lines.insert(last_import + 1, '\n'.join(imports_to_add))
        content = '\n'.join(lines)

    # Replace tags
    # For <button ... className="...">, we can just replace the tag name
    # We will use regex to carefully replace opening and closing tags
    content = re.sub(r'<button\b', r'<Button variant="ghost" size="icon"', content)
    content = content.replace('</button>', '</Button>')
    
    # Input is self closing usually
    content = re.sub(r'<input\b', r'<Input', content)

    with open(filepath, 'w') as f:
        f.write(content)

for root_dir, dirs, files in os.walk('/root/jaryan/frontend/src/pages'):
    for file in files:
        if file in ['FormBuilder.js', 'WorkflowBuilder.js', 'Chat.js', 'Inbox.js']:
            process_file(os.path.join(root_dir, file))
