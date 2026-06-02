// Configuration settings for MRCP Navigator
export const CONFIG = {
  APP_TITLE: "MRCP Navigator",
  
  // Map of authorized email hashes (SHA-256) to their initial password hashes (SHA-256)
  // Email and passwords are lowercased and trimmed before hashing.
  // To generate new hashes, you can use: console.log(await AuthService.hashEmail("your-email@gmail.com"))
  USERS: {
    // tahmeedferdous1946@gmail.com -> initial password: "mrcp2026"
    "28fe4c16ae055a69a6754796c66243be280488c9b1f267800e3ff6968e73c0c5": {
      initialPasswordHash: "6604145d8eba0b200682cd3529c6ff115c3a71e2a726c00a48a99cb7b4231c36"
    },
    // waseefalvee@gmail.com -> initial password: "mrcp2026"
    "83bbd07ef0262fda4b85cfd83e57691f38403b504c58b2fa42d88773f8ece111": {
      initialPasswordHash: "6604145d8eba0b200682cd3529c6ff115c3a71e2a726c00a48a99cb7b4231c36"
    },
    // test@example.com -> initial password: "password123"
    "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b": {
      initialPasswordHash: "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f"
    }
  }
};
