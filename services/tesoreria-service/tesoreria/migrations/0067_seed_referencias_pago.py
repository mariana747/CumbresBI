from django.db import migrations


REFERENCIAS = [
    ("1003", "FH 10", "NW WAY BURGER", "NWB210819DY9", "NW WAY BURGER"),
    ("1004", "L-08", "SANTA CLARA", "ONE200724T2A", "OPERADORA NEDARO"),
    ("1005", "L-26", "LA CHIME", "ONE200724T2A", "OPERADORA NEDARO"),
    ("1006", "L-53, L-54, L-55", "SOY TU SALUD", "OSM160921I24", "OPERADORA DE SERVICIOS MEDICOS ML"),
    ("1007", "L-39", "SUZUKI", "OZA130502GL3", "OZAKARS"),
    ("1008", "S-07-C", "PIRMA", "PDP011101GX5", "PRODUCTOS DEPORTIVOS DE PACHUCA"),
    ("1009", "K4", "PRODUCTOS SALOMON", "PSA0804236U6", "PRODUCTOS SALOMON"),
    ("1010", "FH 09", "BUSHER COCDRIL'S", "RIAL870111916", "MARIA LUISA RIVERO ARIAS"),
    ("1011", "S-07 B", "JUMP-IN PARK", "ROGA850902CJ0", "ALDO DANIEL ROJAS GOMEZ"),
    ("1012", "S-07-A", "JUMP-IN PARK", "ROGA850902CJ0", "ALDO DANIEL ROJAS GOMEZ"),
    ("1013", "FH 04", "IRISH COFFEE", "SACA880229FW0", "ABRAHAM SAAVEDRA CALLEJAS"),
    ("1014", "K5, K6", "VIDEOJUEGOS ORLANBRISA", "SAGH941214H25", "HECTOR ABRAHAM SANTILLAN GARIBAY"),
    ("1015", "FS- 02", "BAJAJ TIZAYUCA", "SMO250220CM4", "SKS MOTOS"),
    ("1016", "S-06", "D'EUROPE", "TAB980709JY8", "TABOAZAS"),
    ("1017", "L-03", "GLOW", "TARG910722IH6", "GLORIA TAN ROSAS"),
    ("1018", "S-04", "ZAPATERIAS 3 HERMANOS", "TIZ190701BDA", "TIZAYUZA"),
    ("1019", "FH 11", "NIKKEI", "COPP680322SP3", "PAULA CORONA PACHECO"),
    ("1020", "SA-05", "NUEVA ERA", "XIDO971008DV1", "DONGYUAN XIA"),
    ("1021", "L-43", "TAI LI", "YAJI940615S74", "JINCHENG YAN"),
    ("1023", "L-56, L-57", "SAKS MOTOS", "EISR840622U65", "RODRIGO ESPINOSA SAKAR"),
    ("1079", "FS-04", "AUTOZONE", "AME970109GW0", "AUTOZONE DE MEXICO"),
    ("1080", "L-09", "FLEXI", "AOMT710505AF2", "TALINA ARROYO MACIAS"),
    ("1081", "KP3", "ARRIAGA PREVISIÓN", "APR930915BF5", "ARRIAGA PREVISION"),
    ("1082", "KEG1", "KEPACREPA", "AUSD0211089M6", "DANIEL AGUILAR SANCHEZ"),
    ("1083", "L-21", "FRAICHE", "BARL850406FA6", "LUZ MARIA BARRON RODRIGUEZ"),
    ("1084", "S-03", "SUMO", "BMA240423CD9", "BIOSUMINISTROS MARKET"),
    ("1086", "L-50", "MACRO PAY", "CAS000522RC7", "CELULARES Y ACCESORIOS DEL SURESTE"),
    ("1087", "S-03", "BARA BARA", "CAS241018HY3", "COMERCIALIZADORA ASMJ"),
    ("1088", "FH 03", "JIA LE", "CEJI810611831", "JINGHONG CHEN"),
    ("1089", "L-48", "CLINICA DE PODOLOGÍA", "COGS6508151F0", "SONIA COSSIO GONZALEZ"),
    ("1090", "FS- 01", "LITTLE CAESAR'S", "COP060201DL4", "COPIZZA"),
    ("1091", "L-41, L-42", "COLCHONES ATLAS", "CRE9711048Z7", "COLCHONERA LOS REYES"),
    ("1092", "S-03", "STEREN", "CTE120614TGA", "COMERCIALIZADORA TEJECI"),
    ("1093", "L-04, L-05, L-06, L-07", "GRABASA", "DCA090127J97", "DISTRIBUIDORA DE CALZADO A.R.S."),
    ("1094", "L-47", "DREAM FASHION", "DFS201210840", "DREAM FASHION SG"),
    ("1095", "L-58, L-59", "LIVERPOOL EXPRESS", "DLI931201MI9", "DISTRIBUIDORA LIVERPOOL"),
    ("1096", "L-25", "DI MAGHENTII PIZZA", "DMP201120KQ4", "DI MAGHENTII PIZZA"),
    ("1097", "L-29", "VOLKSWAGEN PACHUCA", "DVP640102PH2", "DISTRIBUIDORA VOLKSWAGEN DE PACHUCA"),
    ("1098", "L-33, L-34", "OPTICA AMERICANA", "EOP840110786", "ESPECIALISTAS OPTICOS"),
    ("1099", "KP2", "EL REY DEL HELADO", "FAEE941028SJ6", "ERICK ADRIAN FRANCO ESCOBAR"),
    ("1100", "KP4", "URI WAFFLES", "FAEE941028SJ6", "ERICK ADRIAN FRANCO ESCOBAR"),
    ("1101", "L-51, L-52", "EFECTIMUNDO", "FEM060324ID3", "FACIL EMPEÑOS"),
    ("1102", "K3", "PASTELERIA GELATO", "FODM570912LW0", "MARCO ANTONIO FLORES DOMINGUEZ"),
    ("1103", "R-01", "DOMINOS PIZZA", "GAAJ980311B38", "JUAN MANUEL GARCIA ALVARADO"),
    ("1104", "R-07 A", "BUHO TEA", "HUKE021216GV4", "KEVIN ALEX HUANG"),
    ("1105", "L-01", "CELL FASHION", "IATA791130G9A", "ANDREA ISLAS TREJO"),
    ("1106", "L-18", "KIM GARNEG", "KGA130708J13", "KIM GARNEG"),
    ("1107", "R-02", "BURGUER KING", "KOM160405PX0", "KOMEN"),
    ("1108", "K2G", "DELICHURROS", "LERD910702K86", "DAVID LEON REYES"),
    ("1109", "L-46", "SNEAKERS STORE", "LOPE760224ED5", "EDGAR HERIBERTO LOPEZ PEREZ"),
    ("1110", "L-10", "OPTICA JEMA", "MACJ530618R97", "JESUS EFREN MARTINEZ CASTILLO"),
    ("1111", "L-44, L-45", "INSERT COIN", "MARI850930UC7", "ISRAEL MARTINEZ RAMIREZ"),
    ("1112", "S-06", "MB FITNESS", "MFI220908GZ1", "MB FITNESS"),
    ("1113", "5 LUGARES", "ATRAPA PELUCHES", "VELJ840505KR1", "JUAN VELAZQUEZ LICONA"),
    ("1114", "Espacio Abierto", "KALKOMACHINES", "KAL240220S50", "KALKOMACHINES"),
    ("1116", "ESPACIO COMERCIAL", "AG BIOMEDICS", "AOGM801223TA7", "MITZI HARUMI ACOSTA GAYOSSO"),
    ("1117", "Espacio Abierto", "ESTRELLAS DE LA SUERTE", "GONR870509J65", "RAUL ADRIAN GONZALEZ NIETO"),
    ("1123", "L-49", "7 CLEAN", "CHI100906SY7", "CONSTRUCTORA HIDALZAC"),
    ("1124", "L-02", "AT&T", "CHI100906SY7", "CONSTRUCTORA HIDALZAC"),
    ("1125", "L-30, L-31, L-32", "CAFETERIA MARQUEZ", "GAHN790531KT7", "NANCY GARCIA HERNANDEZ"),
    ("1126", "L-35, L-36, L-37, L-38", "TODO PARA EL HOGAR", "MANL660621E55", "LUIS MARQUEZ NAVARRETE"),
    ("1155", "M12", "CAJERO BBVA", "BBA830831LJ2", "BBVA MEXICO, S.A., INSTITUCION DE BANCA MULTIPLE, GRUPO FINANCIERO BBVA MEXICO"),
    ("1156", "M04", "MC BARBERIA", "CECG910927M14", "GENESIS JACQUELINE CRESPO CORTES"),
    ("1157", "M24", "MAPREC", "GOCV8302185SA", "VICTOR MANUEL GONZALEZ CIENFUEGOS"),
    ("1158", "M19", "ALEX KIKIS", "GOHZ010710P19", "ZAIRA HAIDE GONZALEZ HERNANDEZ"),
    ("1159", "M11", "SPORT LUXE", "JUGM860618IA5", "MARLEN ZULEICA JUAREZ GARCIA"),
    ("1160", "M14", "EM BIKE", "MARE800218D68", "ERIK MARTINEZ RODRIGUEZ"),
    ("1161", "M-23", "ROPA", "METN820221LAA", "NELLY MENDEZ TORRES"),
    ("1162", "M10", "EL ASADERO DE TONY", "OKA200520QJ9", "OSI KAN"),
    ("1163", "M01", "SPARTAN SUPLEMENTS SHOP", "RAVM9401291P0", "MELISSA RANGEL VITAL"),
    ("1164", "M06", "OM SECRET BOUTIQUE", "RIMC971120IZ4", "CESAR RIVERO MENESES"),
    ("1165", "M08", "ITACATL", "ROMC9006057JA", "CARLOS RODRIGUEZ MACIAS"),
    ("1166", "M17", "ZONA FRIKI GAME", "RUOM831017B24", "MARCO ANTONIO RUBIO OCHOA"),
    ("1167", "M02", "VI.SA TRAVEL", "SATA840304E47", "ANA MARIA SALINAS TORRES"),
    ("1168", "M03", "JADE MICROPIGMENTACIÓN Y CEJAS", "VEOJ8402216C0", "JADE JAZMIN VELAZQUEZ OLGUIN"),
    ("1169", "M25", "WIMOPAY", "WIM180523CC5", "WIMOCOMUNICA"),
    ("1183", "M22", "PETLAND", "MORB930612NV7", "BETSABE MOSSO RIVAS"),
    ("1184", "M18", "KEWAII", "VEGR800413C77", "ROCIO MARISOL VERA GARCIA"),
    ("1185", "M09", "CAFÉ SHAMADI", None, None),
    ("1186", "M07", "CARAMELLRO", None, None),
    ("1187", "M15", "FRESEATE", None, None),
    ("1188", "M16", "JOYERIA LUPITA", None, None),
    ("1189", "M21", "LA MICHOACANA", None, None),
    ("1190", "L-20", "OH LA LAB SALÓN", "AABG641225CH1", "MARIA GUADALUPE AYALA BARAJAS"),
    ("1191", "ESPACIO ABIERTO", "ARTESANOS", "AILG770708CG3", "GUADALUPE ARIAS LAZARO"),
    ("1193", "L-19", "CENCEL", "CCE940804T7A", "CENTRO CELULAR"),
    ("1194", "M13", "MAGGIE'S PETIT", "AAVK950907NE9", "KATHIA ANALI ALCANTARA VALENTIN"),
    ("1195", "M05", "OM BOUTIQUE", "RIMC971120IZ4", "CESAR RIVERO MENESES"),
    ("1196", "2 LUGARES DE UN METRO CUADRADO CADA UNO", "ALVACO", "AEN921007269", "ALVACO ENTERPRISES"),
    ("1197", "KP1", "LAS ORIGINALES BANDERILLAS COREANAS", "XOTE940304TA5", "ELIZABETH XOTLANIHUA TEPOLE"),
    ("1198", "M20", "DKAN'S", "RIAC8711309G9", "CHRISTOPHER RIVERA ALARCON"),
    ("1199", "B-02", "VENTO", "VPO2109287FA", "VENTO POWERSPORTS"),
    ("1200", "L-39", "HYUNDAI", "LMO240409RC9", "LITHIAS MOTORS"),
    ("1201", "L-40", "AURA BOUTIQUE", "SACA880229FW0", "ABRAHAM SAAVEDRA CALLEJAS"),
    ("1204", "LIB-08", "NISSAN", "AUT181210RR6", "AUTONATION"),
    ("1205", "LIB-09", "MAQUINITAS DE VIDEOJUEGOS", "DIGE861207KFA", "ERENDIRA LEONOR DIMAS GARCIA"),
]


def _tipo_persona(rfc):
    if not rfc:
        return "fisica"
    return "moral" if len(rfc) == 12 else "fisica"


def seed(apps, schema_editor):
    Contraparte = apps.get_model("tesoreria", "TesoreriaContraparte")

    # RFCs ya vistos en esta misma pasada (para duplicados dentro del seed)
    rfcs_vistos = set()

    for ref, local, nombre_comercial, rfc, razon_social in REFERENCIAS:
        rfc_real = rfc if rfc and rfc != "XAXX010101000" else None
        # RFC duplicado dentro del seed → segunda entrada sin RFC
        if rfc_real and rfc_real in rfcs_vistos:
            rfc_real = None
        if rfc_real:
            rfcs_vistos.add(rfc_real)

        rs = razon_social if razon_social else nombre_comercial

        # Si ya existe una contraparte con ese RFC, solo actualizar los campos
        # de locatario; si no, crear nueva.
        if rfc_real:
            existing = Contraparte.objects.filter(rfc=rfc_real).first()
            if existing:
                existing.referencia_pago = ref
                existing.local = local
                existing.nombre_comercial = nombre_comercial
                existing.cliente = True
                existing.save()
                continue

        Contraparte.objects.get_or_create(
            referencia_pago=ref,
            defaults=dict(
                rfc=rfc_real,
                razon_social=rs,
                nombre_comercial=nombre_comercial,
                local=local,
                tipo_persona=_tipo_persona(rfc_real),
                cliente=True,
                origen="manual",
            ),
        )


def unseed(apps, schema_editor):
    Contraparte = apps.get_model("tesoreria", "TesoreriaContraparte")
    refs = [r[0] for r in REFERENCIAS]
    Contraparte.objects.filter(referencia_pago__in=refs).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0066_contraparte_locatario_campos"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
