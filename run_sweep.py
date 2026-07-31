import subprocess
import json
import os

def run():
    # En lugar de rpc o table, usaremos la herramienta del sandbox si estuviera disponible,
    # pero como no lo está, usaremos curl con el service key si lo tuviéramos.
    # No lo tenemos. Usaremos el read_query del sandbox vía dispatch en un bucle de bash.
    pass

