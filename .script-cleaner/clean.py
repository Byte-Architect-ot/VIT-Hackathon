import os
import re

root_dir = '/home/shreyashh/vit'
target_dirs = ['satyabot-backend', 'satyabot-telegram', 'satyabot-extension']

def strip_js_comments(text):
    # Matches strings or comments. Comments are replaced with empty string.
    pattern = re.compile(
        r'("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`)'
        r'|(/\*.*?\*/)'
        r'|(//[^\n]*)',
        re.DOTALL
    )
    def replacer(match):
        if match.group(1):
            return match.group(1)
        else:
            return ""
    return pattern.sub(replacer, text)

# Complete emoji regex for Python
def remove_emojis(text):
    emoji_pattern = re.compile(
        u"([\U0001F600-\U0001F64F]"
        u"|[\U0001F300-\U0001F5FF]"
        u"|[\U0001F680-\U0001F6FF]"
        u"|[\U0001F700-\U0001F77F]"
        u"|[\U0001F780-\U0001F7FF]"
        u"|[\U0001F800-\U0001F8FF]"
        u"|[\U0001F900-\U0001F9FF]"
        u"|[\U0001FA00-\U0001FA6F]"
        u"|[\U0001FA70-\U0001FAFF]"
        u"|[\u2600-\u26FF]"
        u"|[\u2700-\u27BF]"
        u"|[\u2300-\u23FF]"
        u"|[\u2B50]"
        u"|[\U0001F004-\U0001F0CF]"
        u"|[\U0001F170-\U0001F251])"
    )
    return emoji_pattern.sub(r'', text)

def process_file(file_path):
    ext = os.path.splitext(file_path)[1]
    if ext not in ['.js', '.json', '.md', '.txt', '.env']:
        return
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            original = content
            
        if ext == '.js':
            content = strip_js_comments(content)
            
        content = remove_emojis(content)
        
        if content != original:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Cleaned {file_path}")
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")

def walk_dir(directory):
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if '.git' in dirs:
            dirs.remove('.git')
        if 'dist' in dirs:
            dirs.remove('dist')
            
        for d in dirs[:]:
            if d.startswith('.'):
                dirs.remove(d)
                
        for file in files:
            if not file.startswith('.'):
                process_file(os.path.join(root, file))

for d in target_dirs:
    full_path = os.path.join(root_dir, d)
    if os.path.exists(full_path):
        walk_dir(full_path)

for f in os.listdir(root_dir):
    full_path = os.path.join(root_dir, f)
    if os.path.isfile(full_path) and not f.startswith('.'):
        process_file(full_path)

print("Done")
