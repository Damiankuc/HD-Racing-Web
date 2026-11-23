import os
import shutil
import subprocess

# Rutas configurables
POS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dhmotopartes'))
POS_DB_PATH = os.path.join(POS_DIR, 'dhmotopartes_db.json')
LOCAL_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'hdracing_db.json'))

def sync():
    print("=" * 60)
    print("      HD RACING - SINCRONIZADOR DE CATÁLOGO WEB")
    print("=" * 60)
    
    if not os.path.exists(POS_DB_PATH):
        print(f"ℹ️ Archivo local del POS no encontrado en: {POS_DB_PATH}")
        print("Continuando con la versión actual de hdracing_db.json...")
    else:
        # 1. Copiar base de datos del POS si aplica
        try:
            shutil.copy2(POS_DB_PATH, LOCAL_DB_PATH)
            print("✅ Base de datos copiada exitosamente a hdracing_db.json.")
        except Exception as e:
            print(f"❌ Error al copiar base de datos: {e}")
            return

    # 2. Comprobar cambios en Git
    try:
        status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, check=True)
        if not status.stdout.strip():
            print("ℹ️ No hay cambios en productos o precios para sincronizar.")
            return

        print("📦 Registrando cambios en Git...")
        subprocess.run(["git", "add", "hdracing_db.json"], check=True)
        subprocess.run(["git", "commit", "-m", "Actualización automática de catálogo e inventario HD Racing"], check=True)
        
        print("🚀 Subiendo a GitHub...")
        subprocess.run(["git", "push", "origin", "main"], check=True)
        
        print("\n🎉 ¡Sincronización completada con éxito!")
        print("Vercel actualizará el catálogo online en unos segundos.")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error durante el comando Git: {e}")
    except Exception as e:
        print(f"❌ Error inesperado: {e}")

if __name__ == "__main__":
    sync()
