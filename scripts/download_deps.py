import os
import urllib.request
import tarfile
import shutil

ROOT_DIR = "/home/mohammad/projects/chahkaran-main"
BIN_DIR = os.path.join(ROOT_DIR, "bin")
TEMP_DIR = os.path.join(ROOT_DIR, "tmp_deps")

os.makedirs(BIN_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

NODE_URL = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-linux-x64.tar.xz"
MONGO_URL = "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.5.tgz"

def download_file(url, dest):
    if os.path.exists(dest):
        print(f"{dest} already exists, skipping download.")
        return
    print(f"Downloading {url} to {dest}...")
    with urllib.request.urlopen(url) as response, open(dest, 'wb') as out_file:
        shutil.copyfileobj(response, out_file)
    print("Download completed.")

def extract_tar(filepath, dest_dir):
    print(f"Extracting {filepath} to {dest_dir}...")
    with tarfile.open(filepath, 'r:*') as tar:
        tar.extractall(path=dest_dir)
    print("Extraction completed.")

node_tar = os.path.join(TEMP_DIR, "node.tar.xz")
mongo_tar = os.path.join(TEMP_DIR, "mongo.tgz")

# Download
download_file(NODE_URL, node_tar)
download_file(MONGO_URL, mongo_tar)

# Extract Node
node_extract_path = os.path.join(TEMP_DIR, "node_extracted")
os.makedirs(node_extract_path, exist_ok=True)
extract_tar(node_tar, node_extract_path)

# Extract Mongo
mongo_extract_path = os.path.join(TEMP_DIR, "mongo_extracted")
os.makedirs(mongo_extract_path, exist_ok=True)
extract_tar(mongo_tar, mongo_extract_path)

# Find and copy binaries
# Node binaries
node_dir_name = os.listdir(node_extract_path)[0]
node_bin_src = os.path.join(node_extract_path, node_dir_name, "bin")
for item in os.listdir(node_bin_src):
    src = os.path.join(node_bin_src, item)
    dst = os.path.join(BIN_DIR, item)
    if os.path.exists(dst):
        if os.path.islink(dst) or os.path.isfile(dst):
            os.unlink(dst)
        else:
            shutil.rmtree(dst)
    shutil.copy2(src, dst)
    print(f"Copied node binary {item} to {BIN_DIR}")

# Copy node_modules folder from node (contains npm, etc.)
node_lib_src = os.path.join(node_extract_path, node_dir_name, "lib")
dst_lib = os.path.join(ROOT_DIR, "lib")
if os.path.exists(dst_lib):
    shutil.rmtree(dst_lib)
shutil.copytree(node_lib_src, dst_lib)
print(f"Copied node libs to {dst_lib}")

# Fix npm/npx symlinks in bin
# In the node tarball, npm and npx are symlinks to ../lib/node_modules/npm/bin/npm-cli.js
# We need to make sure they point correctly relative to our bin directory
for link_name in ["npm", "npx"]:
    link_path = os.path.join(BIN_DIR, link_name)
    if os.path.exists(link_path) or os.path.islink(link_path):
        os.unlink(link_path)
    os.symlink(f"../lib/node_modules/npm/bin/{link_name}-cli.js", link_path)
    print(f"Created symlink for {link_name} pointing to lib/node_modules")

# Mongo binaries
mongo_dir_name = os.listdir(mongo_extract_path)[0]
mongo_bin_src = os.path.join(mongo_extract_path, mongo_dir_name, "bin")
for item in os.listdir(mongo_bin_src):
    src = os.path.join(mongo_bin_src, item)
    dst = os.path.join(BIN_DIR, item)
    if os.path.exists(dst):
        if os.path.islink(dst) or os.path.isfile(dst):
            os.unlink(dst)
        else:
            shutil.rmtree(dst)
    shutil.copy2(src, dst)
    print(f"Copied mongo binary {item} to {BIN_DIR}")

print("All dependencies downloaded and extracted to bin/ successfully!")
